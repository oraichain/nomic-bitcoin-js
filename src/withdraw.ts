import { getMnemonic } from "./helpers/utils";
import { connect } from "./helpers/connect";
import { OraichainConfig, OraiBtcMainnetConfig } from "./network";
import Long from "long";
import { fromBech32, toBech32 } from "@cosmjs/encoding";
import { Decimal } from "@cosmjs/math";
import { toBinary } from "@cosmjs/cosmwasm-stargate";

async function main(): Promise<void> {
  // get the mnemonic
  const mnemonic = getMnemonic();
  const globalConfig = {
    amount: 3600, // here is 400 * 10^6 BTC
    bitcoinAddress: "bc1q74ftyvlpcjjpzjx9dg45qww4ugrf85tc290hjh",
    timeout: 60,
    obtcAddress:
      "orai10g6frpysmdgw5tdqke47als6f97aqmr8s3cljsvjce4n5enjftcqtamzsd",
    senderChain: {
      port: "wasm.orai195269awwnt5m6c843q6w7hp8rt0k7syfu9de4h0wz384slshuzps8y7ccm",
      channelId: "channel-232",
      denom: "usat",
    },
  };

  const { client, address } = await connect(mnemonic, OraichainConfig, true);
  const addressData = fromBech32(address).data;
  const addressWithRightPrefix = toBech32(OraichainConfig.prefix, addressData);
  const destAddressWithRightPrefix = toBech32(
    OraiBtcMainnetConfig.prefix,
    addressData
  );
  console.log(addressWithRightPrefix, destAddressWithRightPrefix);


  const tx = await client.execute(
    addressWithRightPrefix,
    globalConfig.obtcAddress,
    {
      send: {
        contract: globalConfig.senderChain.port.split(".")[1],
        amount: globalConfig.amount.toString(),
        msg: toBinary({
          local_channel_id: globalConfig.senderChain.channelId,
          remote_address: destAddressWithRightPrefix,
          remote_denom: globalConfig.senderChain.denom,
          timeout: globalConfig.timeout,
          memo: `withdraw:${globalConfig.bitcoinAddress}`,
        }),
      },
    },
    "auto"
  );

  console.log(tx);
}

main().then(
  () => {
    process.exit(0);
  },
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
