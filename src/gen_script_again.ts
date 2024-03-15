import { sha256 } from "bitcoinjs-lib/src/crypto";
import {
  IbcDest,
  redeemScript,
  broadcast,
  encode,
  SigSet,
  calcIbcTimeoutTimestamp,
} from ".";
import { networkConfig } from "./config";
import { getSigset } from ".";
import * as btc from "bitcoinjs-lib"

const possibleHours = [
  "00",
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
];

const scriptsAddress = [
    "bc1qd4qmqc2fasxt0gzc56333hncpyy3he20hdw69pr8gr3l2wyskafsmef95z"
]

const main = async () => {
  const ibcDest: IbcDest = {
    memo: "",
    receiver: "orai1avf3ygt6ctxx4yf4a98eae635lsat5u7tp4pkz",
    sender: "oraibtc1avf3ygt6ctxx4yf4a98eae635lsat5u7pt908a",
    sourceChannel: "channel-0",
    sourcePort: "transfer",
    timeoutTimestamp: 1609305200000000000n,
  };
  const sigsets = JSON.parse((await getSigset(networkConfig.RELAYERS[0]))) as any as SigSet;
  let possibleTimestamps = possibleHours.map((item) =>
    calcIbcTimeoutTimestamp(new Date(`2024-03-14T${item}:00:00.000Z`))
  );
  let allPossibleIbcs = possibleTimestamps.map(timestamp => ({
    ...ibcDest,
    timeoutTimestamp: timestamp
  }))
  for (const ibc of allPossibleIbcs) {
    const script = redeemScript(sigsets, sha256(encode(ibc)));
    let data = btc.payments.p2wsh({
        redeem: { output: script, redeemVersion: 0 },
        network: btc.networks.bitcoin,
    })
    if (scriptsAddress.includes(data.address as string)) {
      const depositAddr = data.address as string;
      const sigsetIndex = sigsets.index;
      const dest = Buffer.concat([Buffer.from([1]), encode(ibc)])
      const res = await broadcast("http://3.144.94.154:8999", depositAddr, sigsetIndex, dest)
      console.log(await res.json());
    }
  }
  
};

main();
