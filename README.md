# Sequelize Migrations

## Introduction

Adds simple support for migrating the schema for Sequelize.js models by keeping track of any errors
and making sure migrations are not run twice. This way migrations can be run automatically when
the app (typically based on Node.js) boots up (i.e. on deploy of new code).

## Usage

See migration.js

## License

This library is released under the MIT license.

## Resources

* [Stackoverflow: Node.js doesn't have a good ORM for managing MySQL schema/migrations](http://stackoverflow.com/questions/8234597/node-js-doesnt-have-a-good-orm-for-managing-mysql-schema-migrations-so-can-i/11432608#11432608)
