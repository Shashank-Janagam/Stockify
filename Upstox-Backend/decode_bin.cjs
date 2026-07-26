const fs = require('fs');
const protobuf = require('protobufjs');

async function run() {
  const root = await protobuf.load('sudo.proto');
  const FeedResponseProto = root.lookupType('com.upstox.marketdatafeeder.rpc.proto.FeedResponse');
  
  const buffer = fs.readFileSync('raw_tick.bin');
  const decoded = FeedResponseProto.decode(buffer);
  
  // Just print the whole thing to see how it parsed
  console.log(JSON.stringify(decoded.toJSON(), null, 2));

  // Let's use protobuf.Reader to scan all tags inside MarketLevel -> Quote
  // Actually, we can just print the exact buffer
}

run();
