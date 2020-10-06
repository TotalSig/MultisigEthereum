// /*global contract, config, it, assert*/
const { assertRevert } = require('./helpers/assertRevert');
const TestToken = artifacts.require("TestToken");
const MultisigVault = artifacts.require("MultisigVault");
const MultisigCarrier = artifacts.require("MultisigCarrier");

const ETHER = 1000000000000000000;

contract("multisigCarrier", accounts => {
  beforeEach(async function () {
    this.tokenOwner  = accounts[0];

    this.service  = accounts[0];
    this.serviceAddress = "0x0A67A2cdC35D7Db352CfBd84fFF5e5F531dF62d1";

    this.party1 = accounts[1];
    this.party2 = accounts[2];

    this.tokenOwner = accounts[5];

    this.destination = "0x0123456789012345678901234567890123456789";
    this.amount = "1000000000000000000";

    this.multisigCarrier = await MultisigCarrier.new({ from: this.service });
  });

  describe('Vault', function() {
    it('should create vault (owner case)', async function () {
        const tx = await this.multisigCarrier.createMultisigVault({ from: this.service });
        const vaultAddress = tx.logs[0].args[0];

        assert.equal(tx.logs[0].event, "NewMultisigCarrierCreated", "NewMultisigCarrierCreated event not emitted");
        assert(vaultAddress != "0x" + "0".repeat(40), "Incorrect address " + JSON.stringify(tx.logs[0]));
    });

    it('should create vault (3rd party case)', async function () {
        const tx = await this.multisigCarrier.createMultisigVault({ from: this.tokenOwner });
        const vaultAddress = tx.logs[0].args[0];

        assert.equal(tx.logs[0].event, "NewMultisigCarrierCreated", "NewMultisigCarrierCreated event not emitted");
        assert(vaultAddress != "0x" + "0".repeat(40), "Incorrect address " + JSON.stringify(tx.logs[0]));
    });

    describe('set info', function() {
      beforeEach(async function () {
        const tx = await this.multisigCarrier.createMultisigVault({ from: this.service });
        this.vaultAddress = tx.logs[0].args[0];
      });

      it('should set vault info', async function () {
          const signatureMinThreshold = 2;
          const parties = [this.party1, this.party2];

          const tx2 = await this.multisigCarrier.setVaultInfo(this.vaultAddress, signatureMinThreshold, parties, { from: this.service });
          assert.equal(tx2.receipt.status, true);
      });

      it('should not allow to set vault info to non owner (participant case)', async function () {
          const signatureMinThreshold = 2;
          const parties = [this.party1, this.party2];

          await assertRevert(
            this.multisigCarrier.setVaultInfo(this.vaultAddress, signatureMinThreshold, parties, { from: this.party1 })
          );
      });

      it('should not allow to set vault info to non owner (3rd patrty case)', async function () {
          const signatureMinThreshold = 2;
          const parties = [this.party1, this.party2];

          await assertRevert(
            this.multisigCarrier.setVaultInfo(this.vaultAddress, signatureMinThreshold, parties, { from: this.tokenOwner })
          );
      });

      it('can check involved parties', async function () {
          const signatureMinThreshold = 2;
          const parties = [this.party1, this.party2];

          await this.multisigCarrier.setVaultInfo(this.vaultAddress, signatureMinThreshold, parties, { from: this.service });

          const assignedParties1 = await this.multisigCarrier.vaultParties.call(this.vaultAddress);
          assert.equal(assignedParties1[0], parties[0]);
          assert.equal(assignedParties1[1], parties[1]);

          this.multisigVault = await MultisigVault.at(this.vaultAddress);

          const assignedParties2 = await this.multisigVault.parties.call();
          assert.equal(assignedParties2[0], parties[0]);
          assert.equal(assignedParties2[1], parties[1]);
      });
    });
  });

  describe('token', function() {
    beforeEach(async function () {
      this.TestToken = await TestToken.new({ from: this.tokenOwner });
      await this.TestToken.mint(this.party1, this.amount, { from: this.tokenOwner });

      const tx = await this.multisigCarrier.createMultisigVault({ from: this.service });
      const vaultAddress = tx.logs[0].args[0];
      const signatureMinThreshold = 2;
      const parties = [this.party1, this.party2];

      const tx2 = await this.multisigCarrier.setVaultInfo(vaultAddress, signatureMinThreshold, parties, { from: this.service });
      assert.equal(tx2.receipt.status, true);

      this.multisigVault = await MultisigVault.at(vaultAddress);
    });

    describe('Participant', function() {
      describe('empty balance', function() {
        it('should not let approve', async function () {
          await assertRevert(
            this.multisigVault.approve(
              this.destination,
              this.TestToken.address,
              this.amount, // 1 ETH
              { from: this.party1 }
            )
          );
        });
      });

      describe('balance ready', function() {
        beforeEach(async function () {
          this.TestToken.transfer(this.multisigVault.address, this.amount, { from: this.party1 });
        });

        it('should let approve', async function () {
          const tx = await this.multisigVault.approve(
              this.destination,
              this.TestToken.address,
              this.amount, // 1 ETH
              { from: this.party1 });
          assert.equal(tx.receipt.status, true);
        });

        describe('party 1 approved', function () {
          beforeEach(async function () {
            this.tx = await this.multisigVault.approve(
                this.destination,
                this.TestToken.address,
                this.amount, // 1 ETH
                { from: this.party1 });
          });

          it('should emit log', async function () {
            assert.equal(this.tx.receipt.status, true);
          })

          it('should have balance on escrow', async function () {
            const escrowBalance = await this.TestToken.balanceOf.call(this.multisigVault.address);
            assert.equal(escrowBalance, 1*ETHER);
          });

          it('should tell about approval', async function () {
            const nonce = await this.multisigCarrier.getNonce.call(
              this.multisigVault.address,
              this.destination,
              this.TestToken.address,
              this.amount // 1 ETH
            );

            assert.ok(nonce > 0);

            const approval = await this.multisigCarrier.partyCoincieded.call(
              this.multisigVault.address,
              this.destination,
              this.TestToken.address,
              this.amount, // 1 ETH
              nonce,
              this.party1
            );
            assert.ok(approval);
          });

          it('should change nonce (evaporates information)', async function () {
            const nonce1 = await this.multisigCarrier.getNonce.call(
              this.multisigVault.address,
              this.destination,
              this.TestToken.address,
              this.amount // 1 ETH
            );

            assert.ok(nonce1 > 0);

            const tx = await this.multisigVault.approve(
                this.destination,
                this.TestToken.address,
                this.amount, // 1 ETH
                { from: this.party2 });
            assert.equal(tx.receipt.status, true);

            const nonce2 = await this.multisigCarrier.getNonce.call(
              this.multisigVault.address,
              this.destination,
              this.TestToken.address,
              this.amount // 1 ETH
            );

            // Because deal information has evaporated and approval has been nullified
            assert.ok(nonce2 == 0);
          });

          describe('party2 approved', function () {
            beforeEach(async function () {
              this.destinationBalanceBefore = await this.TestToken.balanceOf.call(this.destination);
              this.serviceBalanceBefore = await this.TestToken.balanceOf.call(this.serviceAddress);

              this.nonce = await this.multisigCarrier.getNonce.call(
                this.multisigVault.address,
                this.destination,
                this.TestToken.address,
                this.amount // 1 ETH
              );

              this.tx2 = await this.multisigVault.approve(
                this.destination,
                this.TestToken.address,
                this.amount, // 1 ETH
                { from: this.party2 }
              )
            });

            it('not have balance', async function () {
              const escrowBalance = await this.TestToken.balanceOf.call(this.multisigCarrier.address);
              assert.equal(escrowBalance, 0);
            });

            it('should emit logs', async function () {
              assert.equal(this.tx2.receipt.status, true);
            });

            it('should tell about approval', async function () {
              const approval = await this.multisigCarrier.partyCoincieded.call(
                this.multisigVault.address,
                this.destination,
                this.TestToken.address,
                this.amount, // 1 ETH
                this.nonce,
                this.party2
              );
              assert.ok(approval);
            });

            it('should not tell about approval with missing nonce', async function () {
              const approval = await this.multisigCarrier.partyCoincieded.call(
                this.multisigVault.address,
                this.destination,
                this.TestToken.address,
                this.amount, // 1 ETH
                0,
                this.party2
              );
              assert.ok(!approval);
            });

            it('should tell about approval', async function () {
              const destinationBalanceAfter = await this.TestToken.balanceOf.call(this.destination);
              const destinationBalanceChanged = destinationBalanceAfter - this.destinationBalanceBefore;

              assert.equal(destinationBalanceChanged, 1*ETHER);
            });
          });
        });
      });
    });
  });

  describe('coin', function() {
    beforeEach(async function () {
      this.etherAddress = "0x0000000000000000000000000000000000000000"

      const tx = await this.multisigCarrier.createMultisigVault({ from: this.service });
      assert.equal(tx.receipt.status, true);

      const vaultAddress = tx.logs[0].args[0];
      const signatureMinThreshold = 2;
      const parties = [this.party1, this.party2];

      const tx2 = await this.multisigCarrier.setVaultInfo(vaultAddress, signatureMinThreshold, parties, { from: this.service });
      assert.equal(tx2.receipt.status, true);

      this.multisigVault = await MultisigVault.at(vaultAddress);
    });

    describe('Participant', function() {
      describe('empty balance', function() {
        it('should not let approve', async function () {
          await assertRevert(
            this.multisigVault.approve(
              this.destination,
              this.etherAddress,
              this.amount, // 1 ETH
              { from: this.party1 }
            )
          );
        });
      });

      describe('balance ready', function() {
        beforeEach(async function () {
          this.multisigVault.sendTransaction({ from: this.party1, value: 1*ETHER })
        });

        it('should let approve', async function () {
          const tx = await this.multisigVault.approve(
              this.destination,
              this.etherAddress,
              this.amount, // 1 ETH
              { from: this.party1 });
          assert.equal(tx.receipt.status, true);
        });

        describe('party 1 approved', function () {
          beforeEach(async function () {
            this.tx = await this.multisigVault.approve(
                this.destination,
                this.etherAddress,
                this.amount, // 1 ETH
                { from: this.party1 });
          });

          it('should emit log', async function () {
            assert.equal(this.tx.receipt.status, true);
          })

          it('should have balance on escrow', async function () {
            const escrowBalance = await web3.eth.getBalance(this.multisigVault.address);
            assert.equal(escrowBalance, 1*ETHER);
          });

          it('should tell about approval', async function () {
            const nonce = await this.multisigCarrier.getNonce.call(
              this.multisigVault.address,
              this.destination,
              this.etherAddress,
              this.amount // 1 ETH
            );

            assert.ok(nonce > 0);

            const approval = await this.multisigCarrier.partyCoincieded.call(
              this.multisigVault.address,
              this.destination,
              this.etherAddress,
              this.amount, // 1 ETH
              nonce,
              this.party1
            );
            assert.ok(approval);
          });

          it('should change nonce (evaporates information)', async function () {
            const nonce1 = await this.multisigCarrier.getNonce.call(
              this.multisigVault.address,
              this.destination,
              this.etherAddress,
              this.amount // 1 ETH
            );

            assert.ok(nonce1 > 0);

            const tx = await this.multisigVault.approve(
                this.destination,
                this.etherAddress,
                this.amount, // 1 ETH
                { from: this.party2 });
            assert.equal(tx.receipt.status, true);

            const nonce2 = await this.multisigCarrier.getNonce.call(
              this.multisigVault.address,
              this.destination,
              this.etherAddress,
              this.amount // 1 ETH
            );

            // Because deal information has evaporated and approval has been nullified
            assert.ok(nonce2 == 0);
          });

          describe('party2 approved', function () {
            beforeEach(async function () {
              this.destinationBalanceBefore = await web3.eth.getBalance(this.destination);
              this.serviceBalanceBefore = await web3.eth.getBalance(this.serviceAddress);

              this.nonce = await this.multisigCarrier.getNonce.call(
                this.multisigVault.address,
                this.destination,
                this.etherAddress,
                this.amount // 1 ETH
              );

              this.tx2 = await this.multisigVault.approve(
                this.destination,
                this.etherAddress,
                this.amount, // 1 ETH
                { from: this.party2 }
              )
            });

            it('not have balance', async function () {
              const escrowBalance = await web3.eth.getBalance(this.multisigCarrier.address);
              assert.equal(escrowBalance, 0);
            });

            it('should emit logs', async function () {
              assert.equal(this.tx2.receipt.status, true);
            });

            it('should tell about approval', async function () {
              const approval = await this.multisigCarrier.partyCoincieded.call(
                this.multisigVault.address,
                this.destination,
                this.etherAddress,
                this.amount, // 1 ETH
                this.nonce,
                this.party2
              );
              assert.ok(approval);
            });

            it('should not tell about approval with missing nonce', async function () {
              const approval = await this.multisigCarrier.partyCoincieded.call(
                this.multisigVault.address,
                this.destination,
                this.etherAddress,
                this.amount, // 1 ETH
                0,
                this.party2
              );
              assert.ok(!approval);
            });

            it('should tell about approval', async function () {
              const destinationBalanceAfter = await web3.eth.getBalance(this.destination);
              const destinationBalanceChanged = destinationBalanceAfter - this.destinationBalanceBefore;

              assert.equal(destinationBalanceChanged, 1*ETHER);
            });
          });
        });
      });
    });
  });
});
