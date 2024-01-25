import { networkConfig } from "./config";

const calculateEstWitnessSize = (signatoriesLength: number) => {
  return signatoriesLength * 79 + 39; // 79 and 39 are magic numbers
};

const calculateInputSize = (estWitnessSize: number) => {
  return estWitnessSize + 40; // 40 is a magic number
};

const calculateFeeRateFromMinerFee = (
  minerFeeRate: number,
  estWitnessSize: number
) => {
  return (minerFeeRate * 10 ** 8) / estWitnessSize; // miner fee rate is in BTC, we * 10**8 to convert to sats
};

const calculateDepositFees = async () => {
  const { signatories, minerFeeRate, index } = await (
    await fetch(`${networkConfig.RELAYERS}/sigset`)
  ).json();
  const witnessSize = calculateEstWitnessSize(signatories.length);
  const feeRate = calculateFeeRateFromMinerFee(minerFeeRate, witnessSize);
  const inputSize = calculateInputSize(witnessSize);

  // calculate the actual fees
  const depositFees = inputSize * feeRate;
  return { depositFees, index, witnessSize, feeRate };
};

const calculateCheckpointFees = async (
  feeRate: number,
  witnessSize: number
) => {
  const { checkpoint_vsize: vsizeCheckpointTx, total_input_size: inputLength } =
    await (
      await fetch(
        `${networkConfig.LCD}/bitcoin/checkpoint/current_checkpoint_size`
      )
    ).json();
  const totalCheckpointInputWitnessSize = inputLength * witnessSize;
  const estVsize = vsizeCheckpointTx + totalCheckpointInputWitnessSize;
  return feeRate * estVsize;
};

const calculateWithdrawFees = async (feeRate: number, dest: string) => {
  const scriptPubkey = await (
    await fetch(`${networkConfig.LCD}/bitcoin/script_pubkey/${dest}`)
  ).json();
  console.log("base64 script pubkey: ", scriptPubkey);
  return (9 + Buffer.from(scriptPubkey, "base64").length) * feeRate; // 9 is the magic number
};

const main = async () => {
  setInterval(async () => {
    const { depositFees, index, witnessSize, feeRate } =
      await calculateDepositFees();
    const checkpointFees = await calculateCheckpointFees(feeRate, witnessSize);
    const withdrawalFees = await calculateWithdrawFees(
      feeRate,
      "bc1qxg209hlj9v42v9xdva67rvl7fr7w83rd8c7jqs"
    );
    console.log(
      `Fee rate: ${feeRate}.\nDeposit fees: ${depositFees} sats.\nCheckpoint fees: ${checkpointFees}.\nWithdrawal fees: ${withdrawalFees}.\nWe are at pending checkpoint ${index}`
    );
    console.log("====================================================");
    console.log("====================================================");
  }, 3000);
};

main();
