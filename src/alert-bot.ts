import { serializeError } from "serialize-error";
import { networkConfig, userConfig } from "./config";
import { WebhookClient } from "discord.js";

const checkpointFeesInterval = 5; // 3 hours
const sleepTime = 60000; // 1 mins

const milliToHour = (timestamp: number) => {
  return timestamp / 1000 / 60 / 60;
};

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

const alertConfirmedCheckpoints = async (prevLastConfirmedIndex: number) => {
  const currentLastConfirmedIndex = await fetch(
    `${networkConfig.LCD}/bitcoin/checkpoint/last_confirmed_index`
  ).then((data) => data.json());
  if (
    !currentLastConfirmedIndex ||
    !currentLastConfirmedIndex.last_confirmed_index
  ) {
    throw `Cannot query last checkpoint confirmed index ${JSON.stringify(
      serializeError(currentLastConfirmedIndex)
    )}`;
  }
  // if it is the first time we call this func -> just return empty [] & the last confirmed index
  if (prevLastConfirmedIndex === -1)
    return {
      listNewConfirmedIndexes: [],
      prevLastConfirmedIndex: currentLastConfirmedIndex.last_confirmed_index,
    };
  let listNewConfirmedIndexes: number[] = [];
  // collect next confirmed indexes that we have not alerted yet
  for (
    let i = prevLastConfirmedIndex + 1;
    i <= currentLastConfirmedIndex;
    i++
  ) {
    listNewConfirmedIndexes.push(i);
  }
  return {
    listNewConfirmedIndexes,
    prevLastConfirmedIndex: currentLastConfirmedIndex.last_confirmed_index,
  };
};

const main = async () => {
  let checkpointNotEnoughFeesIntervalHour = milliToHour(new Date().getTime());
  const webhookClient = new WebhookClient({
    url: userConfig.DISCORD_WEBHOOK_URL as string,
  });
  let prevLastConfirmedIndex = -1;

  while (true) {
    try {
      // detect checkpoint not enough fees logic
      const curSigSet = await fetch(`${networkConfig.RELAYERS[0]}/sigset`).then(
        (data) => data.json()
      );
      const curIndex: number = curSigSet.index;
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
          throw `Cannot confirm checkpoint ${curIndex} & relay deposit and withdraw tokens due to not enough miner fees. Wanted ${minerFees}, got ${feeCollected}`;
        }
      }

      // alert confirmed checkpoints logic
      const {
        listNewConfirmedIndexes,
        prevLastConfirmedIndex: newLastConfirmedIndex,
      } = await alertConfirmedCheckpoints(prevLastConfirmedIndex);
      prevLastConfirmedIndex = newLastConfirmedIndex;
      console.log({ listNewConfirmedIndexes, prevLastConfirmedIndex });
      if (listNewConfirmedIndexes.length > 0) {
        await webhookClient.send(
          `Checkpoints ${listNewConfirmedIndexes.join(
            ","
          )} have been confirmed on Bitcoin`
        );
      }
    } catch (error) {
      console.log("error: ", error);
      await webhookClient.send(JSON.stringify(serializeError(error)));
      // TODO: send to discord
    } finally {
      await new Promise((resolve) => setTimeout(resolve, sleepTime));
    }
  }
};

main();
