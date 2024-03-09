import { serializeError } from "serialize-error";
import { networkConfig, userConfig } from "./config";
import { WebhookClient } from "discord.js";

const detectCheckpointNotEnoughFees = async (currentIndex: number) => {
  const currentCheckpointFees = await fetch(
    `${networkConfig.LCD}/bitcoin/checkpoint_fee_info?checkpoint_index=${currentIndex}`
  ).then((data) => data.json());

  if (currentCheckpointFees.fees_collected < currentCheckpointFees.miner_fee) {
    return {
      isNotEnough: true,
      feeCollected: currentCheckpointFees.fees_collected,
      minerFees: currentCheckpointFees.miner_fee,
    };
  }
  return {
    isNotEnough: false,
    feeCollected: currentCheckpointFees.fees_collected,
    minerFees: currentCheckpointFees.miner_fee,
  };
};

const checkpointFeesInterval = 5; // 3 hours

const milliToHour = (timestamp: number) => {
  return timestamp / 1000 / 60 / 60;
};

const main = async () => {
  let checkpointNotEnoughFeesIntervalHour = milliToHour(new Date().getTime());
  const webhookClient = new WebhookClient({
    url: userConfig.DISCORD_WEBHOOK_URL as string,
  });

  while (true) {
    try {
      const curSigSet = await fetch(`${networkConfig.RELAYERS[0]}/sigset`).then(
        (data) => data.json()
      );
      const curIndex: number = curSigSet.index;
      // if there is a problem with
      if (!curIndex) {
        throw "Error querying current checkpoint index";
      }
      const { isNotEnough, feeCollected, minerFees } =
        await detectCheckpointNotEnoughFees(curIndex);
      console.log({ isNotEnough, feeCollected, minerFees });
      if (isNotEnough) {
        const nowInHour = milliToHour(new Date().getTime());
        if (
          nowInHour >
          checkpointNotEnoughFeesIntervalHour + checkpointFeesInterval
        ) {
          // reset checkpoint time
          checkpointNotEnoughFeesIntervalHour = nowInHour;
          throw `Cannot relay deposit and withdraw tokens due to not enough miner fees. Wanted ${minerFees}, got ${feeCollected}`;
        }
      }
    } catch (error) {
      console.log("error: ", error);
      await webhookClient.send(JSON.stringify(serializeError(error)));
      // TODO: send to discord
    } finally {
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
};

main();
