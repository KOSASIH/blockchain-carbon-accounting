// SPDX-License-Identifier: Apache-2.0
require("@nomiclabs/hardhat-waffle");
require("solidity-coverage");
require("hardhat-gas-reporter");
require("@nomiclabs/hardhat-etherscan");
require('hardhat-deploy');
require('hardhat-deploy-ethers');

// Make sure to run `npx hardhat clean` before recompiling and testing
if (process.env.OVM) {
  require("@eth-optimism/plugins/hardhat/compiler");
  require("@eth-optimism/plugins/hardhat/ethers");
}

// Uncomment and populate .ethereum-config.js if deploying contract to Goerli, Kovan, xDai, or verifying with Etherscan
// const ethereumConfig = require("./.ethereum-config");


// Task to destroy a NetEmissionsTokenNetwork contract
task("destroyClm8Contract", "Destroy a NetEmissionsTokenNetwork contract")
  .addParam("contract", "The CLM8 contract to destroy")
  .setAction(async taskArgs => {
    const [admin] = await ethers.getSigners();
    const NetEmissionsTokenNetwork = await hre.ethers.getContractFactory("NetEmissionsTokenNetwork");
    const contract = await NetEmissionsTokenNetwork.attach(taskArgs.contract);
    await contract.connect(admin).selfDestruct();
  })

// Task to set limited mode on NetEmissionsTokenNetwork
task("setLimitedMode", "Set limited mode on a NetEmissionsTokenNetwork contract")
  .addParam("value", "True or false to set limited mode")
  .addParam("contract", "The CLM8 contract")
  .setAction(async taskArgs => {
    const [admin] = await ethers.getSigners();
    const NetEmissionsTokenNetwork = await hre.ethers.getContractFactory("NetEmissionsTokenNetwork");
    const contract = await NetEmissionsTokenNetwork.attach(taskArgs.contract);
    await contract.connect(admin).setLimitedMode( (taskArgs.value) == "true" ? true : false );
  })

// Task to move the state of one NetEmissionsTokenNetwork contract to another
task("migrateClm8Contract", "Move the tokens and balances of an old CLM8 contract to a blank one")
  .addParam("oldContract", "The old CLM8 contract to read from")
  .addParam("newContract", "The new CLM8 contract to write to (must be deployed with no tokens issued)")
  .setAction(async taskArgs => {
    const [admin] = await ethers.getSigners();
    const NetEmissionsTokenNetwork = await hre.ethers.getContractFactory("NetEmissionsTokenNetwork");
    const oldContract = await NetEmissionsTokenNetwork.attach(taskArgs.oldContract);
    const newContract = await NetEmissionsTokenNetwork.attach(taskArgs.newContract);

    // require number of tokens on new contract to be zero
    if ( (await newContract.getNumOfUniqueTokens()).toNumber() !== 0 ) {
      console.log("New contract must have a blank state (no tokens). Exiting without action.");
      return;
    }

    const numOfTokens = (await oldContract.getNumOfUniqueTokens()).toNumber();
    let tokens = [];

    // get details of every token and find all accounts on contract
    for (let i = 1; i <= numOfTokens; i++) {

      // get details of given token on old contract
      let details = await oldContract.getTokenDetails(i);
      tokens.push({
        issuer: details.issuer,
        issuee: details.issuee,
        tokenTypeId: details.tokenTypeId,
        fromDate: details.fromDate,
        thruDate: details.thruDate,
        automaticRetireDate: details.automaticRetireDate,
        metadata: details.metadata,
        manifest: details.manifest,
        description: details.description,
        holders: [],
        balances: []
      });

      // get holders of given token on old contract
      tokens[i-1].holders = await oldContract.getHolders(i);

      // get balances of given token for each address on old contract
      for (let j = 0; j < tokens[i-1].holders.length; j++) {
        let balance = await oldContract.balanceOf(tokens[i-1].holders[j], i);

        tokens[i-1].balances.push(balance);
      }

      // mint token on new contract to initial issuee
      console.log(`Issuing token of ID ${i+1}...`);
      await newContract.connect(admin).issueOnBehalf(
        details.issuee,
        details.issuer,
        details.tokenTypeId,
        tokens[i].balances[0],
        details.fromDate,
        details.thruDate,
        details.automaticRetireDate,
        details.metadata,
        details.manifest,
        details.description
      );

      // distribute balances to other holders (skipping first holder)
      for (let j = 1; j < tokens[i-1].holders.length; j++) {

        let to = tokens[i-1].holders[j];
        let quantity = tokens[i-1].balances[j];
        console.log(to);

        // skip blank balances
        if (quantity.toNumber() === 0)
          continue;

        console.log(`Minting more tokens of ID ${i+1} to address ${to}...`);
        await newContract.connect(admin).mint(
          to,
          i,
          quantity
        );
      }

    }

    console.log("Tokens queried: ");
    console.log(tokens);

    console.log(`${tokens.length} CLM8 tokens minted on new contract ${taskArgs.newContract}. You can now call \`npx hardhat destroyClm8Contract\` with the old contract to destroy it.`);

  });

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {

  namedAccounts: {
    deployer: { default: 0 },
    dealer1: { default: 1 },
    dealer2: { default: 2 },
    dealer3: { default: 3 },
    dealer4: { default: 4 },
    consumer1: { default: 5 },
    consumer2: { default: 6 },
  },

  solidity: {

    compilers: [
      {
        version: "0.7.0",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      }
    ]


  },
  gasReporter: {
    currency: 'USD',
  },
  networks: {
    hardhat: {
      chainId: 1337
    },

    ovm_localhost: {
      url: `http://localhost:9545`
    },

    // Uncomment the following lines if deploying contract to Optimism on Kovan
    // Deploy with npx hardhat run --network optimism_kovan scripts/___.js
    // optimism_kovan: {
    //   url: `https://kovan.optimism.io/`,
    //   accounts: [`0x${ethereumConfig.CONTRACT_OWNER_PRIVATE_KEY}`]
    // },

    // Uncomment the following lines if deploying contract to Arbitrum on Kovan
    // Deploy with npx hardhat run --network arbitrum_kovan scripts/___.js
    // arbitrum_kovan: {
    //   url: `https://kovan4.arbitrum.io/rpc`,
    //   accounts: [`0x${ethereumConfig.CONTRACT_OWNER_PRIVATE_KEY}`]
    // },

    // Uncomment the following lines if deploying contract to Goerli or running Etherscan verification
    // Deploy with npx hardhat run --network goerli scripts/___.js
    // goerli: {
    //   url: `https://goerli.infura.io/v3/${ethereumConfig.INFURA_PROJECT_ID}`,
    //   accounts: [`0x${ethereumConfig.CONTRACT_OWNER_PRIVATE_KEY}`]
    // },

    // Uncomment the following lines if deploying contract to xDai
    // Deploy with npx hardhat run --network xdai scripts/___.js
    // xdai: {
    //   url: "https://xdai.poanetwork.dev",
    //   chainId: 100,
    //   accounts: [`0x${ethereumConfig.CONTRACT_OWNER_PRIVATE_KEY}`]
    // }

    // Uncomment the following lines if deploying contract to Kovan
    // Deploy with npx hardhat run --network kovan scripts/___.js
    // kovan: {
    //   url: `https://kovan.infura.io/v3/${ethereumConfig.INFURA_PROJECT_ID}`,
    //   accounts: [`0x${ethereumConfig.CONTRACT_OWNER_PRIVATE_KEY}`]
    // }

  },
  // Uncomment if running contract verification
  // etherscan: {
  //   apiKey: `${ethereumConfig.ETHERSCAN_API_KEY}`
  // },
  ovm: {
    solcVersion: '0.7.6'
  }
};
