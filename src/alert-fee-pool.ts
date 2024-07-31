import { serializeError } from "serialize-error";
import { networkConfig, userConfig } from "./config";
import { WebhookClient } from "discord.js";
import { toDisplay } from "@oraichain/oraidex-common";

const sleepTime = 60000; // 1 mins

const detectFeePool = async () => {
  const currentCheckpointFees = await fetch(
    `${networkConfig.LCD}/bitcoin/checkpoint_fee_info`
  ).then((data) => data.json());
  console.log({ currentCheckpointFees });

  const currentFeePool = await fetch(
    `${networkConfig.LCD}/bitcoin/fee_pool`
  ).then((data) => data.json());
  console.log({ currentFeePool });

  return {
    minerFees: currentCheckpointFees.miner_fee,
    feePool: currentFeePool.fee_pool,
  };
};

const main = async () => {
  const webhookClient = new WebhookClient({
    url: userConfig.DISCORD_WEBHOOK_URL as string,
  });
  while (true) {
    try {
      const { minerFees, feePool } = await detectFeePool();
      const formattedFeePool = toDisplay(BigInt(feePool), 14);
      const formattedMinerFees = toDisplay(BigInt(minerFees), 8);
      if (feePool < minerFees) {
        await webhookClient.send(
          `Fee pool is less than miner fees, you have to add more BTC to fee pool. Fee pool: ${formattedFeePool}, miner fees: ${formattedMinerFees}`
        );
      } else {
        const currentTime = new Date();
        if (
          currentTime.getUTCHours() === 17 &&
          currentTime.getUTCMinutes() === 0
        ) {
          await webhookClient.send(
            `Fee pool is enough to pay for miner fees. Fee pool: ${formattedFeePool}, miner fees: ${formattedMinerFees}`
          );
        }
      }
    } catch (err) {
      console.log("error: ", err);
      await webhookClient.send(JSON.stringify(serializeError(err)));
    } finally {
      await new Promise((resolve) => setTimeout(resolve, sleepTime));
    }
  }
};

main();
