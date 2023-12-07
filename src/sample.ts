import {
  generateDepositAddress,
  DepositOptions,
  getPendingDeposits,
  DepositSuccess,
} from ".";

import { networkConfig } from "./config";

const receiver =
  process.env.RECEIVER || "orai1ehmhqcn8erf3dgavrca69zgp4rtxj5kqgtcnyd";
const sender = process.env.SENDER;
console.log("sender: ", sender);
const sampleGetDepositAddress = async () => {
  const config = {
    relayers: networkConfig.RELAYERS,
    channel: networkConfig.IBC_CHANNEL, // ibc between oraibtc and orai chain
    network: networkConfig.NETWORK,
    receiver, // bech32 address of the depositing user,
    sender,
  } as DepositOptions;

  const btcAddressToDeposit = (await generateDepositAddress(
    config,
    false
  )) as DepositSuccess;

  console.log("BTC Address To Deposit For Bridging: ", btcAddressToDeposit);
};

const getPendingDepositsWhenFaucetingOnBtcAddress = async () => {
  const config = {
    relayers: networkConfig.RELAYERS,
    receiver, // orai address to check
  };

  const data = await getPendingDeposits(config.relayers, config.receiver);

  let total = 0;
  data.forEach((item) => {
    total += item.amount;
  });

  console.log("Pending Deposits:", data);
  console.log("There are", total, "tokens pending");
};

const main = async () => {
  await sampleGetDepositAddress();
  console.log("====================================================");
  console.log("====================================================");
  console.log("====================================================");
  setInterval(async () => {
    await getPendingDepositsWhenFaucetingOnBtcAddress();
  }, 1000);
};

main();
