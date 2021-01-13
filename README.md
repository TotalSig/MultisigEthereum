# Prepare for testing

* Install Truffle.js

    npm install

* Install Ganache and launch it

    https://truffleframework.com/ganache

* Then

    node_modules/.bin/truffle compile

* Then

    node_modules/.bin/truffle migrate

* Finally run test

    node_modules/.bin/truffle test

* To flatten contract

    node_modules/.bin/truffle-flattener contracts/MultisigCarrier.sol > flattened_contracts/MultisigCarrier.sol
    node_modules/.bin/truffle-flattener contracts/MultisigVault.sol > flattened_contracts/MultisigVault.sol

## Tutorials and accompined materials

* Beginners guide - https://truffleframework.com/tutorials/pet-shop
* Truffle documantation - https://truffleframework.com/docs/truffle/getting-started/creating-a-project
* Ganache quickstart guide - https://truffleframework.com/docs/ganache/quickstart
* OpenZeppelin library - https://github.com/OpenZeppelin/openzeppelin-solidity
* Full list of Truffle solidity assertions - https://github.com/trufflesuite/truffle-core/blob/master/lib/testing/Assert.sol
* How to call methods - https://github.com/ethereum/wiki/wiki/JavaScript-API#contract-methods
* Goor tutorial - https://www.sitepoint.com/flattening-contracts-debugging-remix/
