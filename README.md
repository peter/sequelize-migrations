# Sequelize Migrations

## Introduction

Adds simple support for migrating the schema for Sequelize.js models by keeping track of any errors
and making sure migrations are not run twice. This way migrations can be run automatically when
the app (typically based on Node.js) boots up (i.e. on deploy of new code).

## Usage

```
var Sequelize = require('sequelize'); // load Sequelize.js
var sequelize = new Sequelize(...your-mysql-config-here...); // create a Sequelize instance (connection)

var Migration = require('migration.js')(sequelize); // Load this library using your Sequelize instance

Migration.bootstrap(function() { // Make sure the Migration library schema is loaded
  Migration.runOnce("Articles_author_id_fk", "ALTER TABLE Articles ADD CONSTRAINT Articles_author_id_fk FOREIGN KEY (author_id) REFERENCES Accounts(id)");
});
```

For more details, see migration.js.

## License

This library is released under the MIT license.

## Resources

* [Stackoverflow: Node.js doesn't have a good ORM for managing MySQL schema/migrations](http://stackoverflow.com/questions/8234597/node-js-doesnt-have-a-good-orm-for-managing-mysql-schema-migrations-so-can-i/11432608#11432608)
