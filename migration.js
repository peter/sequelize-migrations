var Sequelize = require('sequelize');
var async = require('async');

// This module provides basic support for migrating your Sequelize database tables
// and making sure migrations are only run once.
//
// As of version 1.3.0 Sequelize.js has built in migration support, however it didn't work so
// well for us when we tried it since it didn't allow a flexible configuration/connection to the database.
// Also, our approach to migrations was not so much to run them from the command line but rather
// to have migrations in the same file as the corresponding Sequelize table definitions and have
// them be run automatically on server start/deploy.
//
// Migrations are stored in two database tables: Migrations and MigrationStatements.
// Each migration has a unique identifier key that you must provide and can have multiple SQL statements
// (typically ALTER TABLE statements). Any errors encountered are stored in the error_code/error_info columns
// in MigrationStatements. Error codes for MySQL 5.5 can be found at http://dev.mysql.com/doc/refman//5.5/en/error-messages-server.html
// Example codes:
// 1060 - duplicate column name (when you try to add same column twice)
// 1061 - duplicate key name (when you try to add same index twice)
//
// TODO: apparently Sequelize/MySQL will let you insert empty strings in not null columns. Need to check for that and disallow it.
// TODO: success/error callbacks
// TODO: use START TRANSACTION/SELECT FOR UPDATE/COMMIT for concurrency support (i.e. to safely allow multiple Node processes)
// TODO: due to a foreign key statement the module is currently MySQL specific but that could be fixed pretty easily.
// TODO: (nice to have) pre/post conditions as sanity checks for migrations
// TODO: (nice to have) an alter table DSL
//
// DEPENDENCIES: Sequelize.js, async.js, MySQL with InnoDB
//
// LIMITATION: no multi process concurrency guarantee
//
// The sequelize argument to this module is the applications Sequelize instance (database connection).
//
// EXAMPLE USAGE:
// 
// var sequelize = new Sequelize(constants.MYSQL_DB, constants.MYSQL_USER, constants.MYSQL_PASSWORD, {  
//   dialect: 'mysql',
//   host: constants.MYSQL_HOST,
//   port: constants.MYSQL_PORT,
//   logging: constants.VERBOSE_SEQUELIZE,
//   pool: { maxConnections: 2, maxIdleTime: 30}
// });
//
// var Migration = require('migration.js')(sequelize);
//
// Migration.bootstrap(function() {
//   Migration.runOnce("Articles_author_id_fk", "ALTER TABLE Articles ADD CONSTRAINT Articles_author_id_fk FOREIGN KEY (author_id) REFERENCES Accounts(id)");
// });
//
module.exports = function(sequelize) {
  var Migration = sequelize.define('Migration', {
    migration_key: { type: Sequelize.STRING, allowNull: false, unique: true}
  });

  var MigrationStatement = sequelize.define('MigrationStatement', {
    migration_id: { type: Sequelize.INTEGER, allowNull: false},
    sql_statement: { type: Sequelize.TEXT, allowNull: false},
    status: { type: Sequelize.STRING, allowNull: false, defaultValue: "pending"},
    error_code: { type: Sequelize.INTEGER},
    error_info: { type: Sequelize.TEXT}
  });

  var isEmpty = function(str) {
    return (!str || 0 === str.length);
  };

  var normalize = function(str) {
    return isEmpty(str) ? null : str;
  };

  var executeSql = function(sql) {
    return sequelize.query(sql, null, {raw: true});
  };

  // Make errors easily detectable in a verbose log file
  var logError = function() {
    console.log(
      "\n\n=================== !!!Migration ERROR!!! ===================\n\n",
      arguments,
      "\n\n"
    );
  }

  var runIfNotExists = function(key, callback) {
    Migration.find({ where: {migration_key: normalize(key)} }).success(function(migration) {
      if (!migration) {
        callback();
      }
    });
  };

  var createPendingStatements = function(migration, sqlStatements, callback) {
    var statements = [];
    var iterator = function(sql, iteratorCallback) {
      MigrationStatement.create({
        migration_id: migration.id,
        sql_statement: normalize(sql)
      }).success(function(migrationStatement) {
        statements.push(migrationStatement);
        iteratorCallback();
      }).error(function(e) {
        iteratorCallback(e); // async will abort iteration here
      });
    };

    // We could do this in parallel but I'm using series here to preserve the order of the statements
    async.forEachSeries(sqlStatements, iterator, function() {
      callback(statements);
    });
  };

  var runPendingStatements = function(statements) {
    async.forEachSeries(statements, function(statement, callback) {
      executeSql(statement.sql_statement).success(function() {
        statement.status = "success";
        statement.save().success(function() {
          callback();        
        });
      }).error(function(error) {
        statement.status = "failure";
        statement.error_code = error.number;
        statement.error_info = error;
        logError("Migration SQL statement failed with error code " + error.number + ": " + error);
        statement.save().success(function() {
          callback(error); // the error will make async abort the series which is what we want
        });
      });          
    });
  };

  // PUBLIC INTERFACE

  // Run this function first to make sure the migrations database tables are present in the database
  // when the runOnce/runAllOnce functions are invoked.
  Migration.bootstrap = function(callback) {
    Migration.sync().success(function() {
      MigrationStatement.sync().success(function() {
        executeSql("select constraint_name from information_schema.KEY_COLUMN_USAGE where table_name = 'MigrationStatements'").success(function(rows) {
          if (rows == null || rows.length == 0) {
            executeSql("ALTER TABLE MigrationStatements ADD CONSTRAINT MigrationStatements_migration_id_fk FOREIGN KEY (migration_id) REFERENCES Migrations(id) ON DELETE CASCADE");
          }
        });
        if (callback) callback();
      }).error(function(error) {
        logError("Failed to run MigrationStatement.sync", error);
      });
    }).error(function(error) {
      logError("Failed to run Migration.sync", error)
    });  
  };

  // The key argument must be a globally unique name (identifier) for the migration
  // that need to come up with. For example if you are adding a foreign key to the column
  // Articles.author_id you could call the key "Articles_author_id_fk" as that describes what
  // the migration does and should be pretty unique as its scoped by table name and column name.
  // The sqlStatements argument is either a string with a full SQL statement ("ALTER TABLE...") or
  // an array with such SQL statements. Example:
  //
  // Migration.runOnce("Articles_author_id_not_null", "ALTER TABLE Articles MODIFY author_id INT(11) NOT NULL");
  //
  Migration.runOnce = function(key, sqlStatements) {
    sqlStatements = (sqlStatements instanceof Array) ? sqlStatements.slice() : [sqlStatements];
    runIfNotExists(key, function() {
      Migration.create({migration_key: normalize(key)}).success(function(migration) {
        createPendingStatements(migration, sqlStatements, function(statements) {
          runPendingStatements(statements);
        });
      }).error(function() {
        logError("Failed to create migration", key, sqlStatements);
      });    
    });
  };

  // The migrations argument is a nested Array with migration key/sqlStatements tuples.
  // This function is just syntactic sugar around runOnce. Example:
  //
  // Migration.runAllOnce([
  //   ["Articles_author_id_add", "ALTER TABLE Articles ADD COLUMN author_id INT"],
  //   ["Articles_handled_by_add", "ALTER TABLE Articles ADD COLUMN handled_by INT"],
  // ]);
  //
  Migration.runAllOnce = function(migrations) {
    for (var i = 0; i < migrations.length; ++i) {
      Migration.runOnce(migrations[i][0], migrations[i][1]);
    }
  };

  return Migration;
};
