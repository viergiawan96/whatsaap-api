module.exports = (sequelize, DataTypes) => {
  const trn_keyword = sequelize.define("trn_keyword", {
    id_phone: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    keyword: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    res_keyword: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  });
  return trn_keyword;
};
