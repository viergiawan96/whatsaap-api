const Sequelize = require("sequelize");
const sequelize = new Sequelize(
  process.env.DB_DATABASE,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: process.env.DB_DIALECT,
    operatorAliases: false,
    pool: {
      max: parseInt(process.env.DB_POOL_MAX),
      min: parseInt(process.env.DB_POOL_MIN),
      accquire: parseInt(process.env.DB_POOL_ACCQUIRE),
      idle: parseInt(process.env.DB_POOL_IDLE),
    },
  }
);

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

db.trn_keyword = require("./trn_keyword.model")(sequelize, Sequelize);

module.exports = db;
