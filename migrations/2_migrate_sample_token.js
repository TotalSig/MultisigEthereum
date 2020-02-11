var EursTestToken = artifacts.require("./EursTestToken.sol");

module.exports = function(deployer) {
  deployer.deploy(EursTestToken);
};
