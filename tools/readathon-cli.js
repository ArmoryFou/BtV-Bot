const dotenv = require("dotenv");
const { MongoClient } = require("mongodb");
const readathon = require("../lib/readathon.js");

dotenv.config();

function usage() {
  console.log(`
Readathon CLI

  node tools/readathon-cli.js list
  node tools/readathon-cli.js create DD/MM/AAAA META_HORAS [CANAL_ID]
  node tools/readathon-cli.js status ID
  node tools/readathon-cli.js refresh ID
  node tools/readathon-cli.js add ID DISCORD_ID HORAS [USUARIO]
  node tools/readathon-cli.js finish ID
`);
}

async function run() {
  const [command, ...args] = process.argv.slice(2);
  if (!command) return usage();

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db("nihongotracker").collection("btv");

  try {
    if (command === "list") {
      const events = await readathon.listReadathons(db);
      if (events.length === 0) return console.log("No hay readathons guardados.");
      for (const event of events) {
        console.log(`${event.readathonId}  ${event.date}  ${event.status}  ${event.targetMinutes / 60} h`);
      }
      return;
    }

    if (command === "create") {
      const [date, targetHours, channelId] = args;
      const event = await readathon.createReadathon(db, { date, targetHours, channelId: channelId || null });
      console.log(`Readathon creado: ${event.readathonId}`);
      console.log(readathon.formatReadathonText(event));
      return;
    }

    if (command === "status") {
      const event = await readathon.getReadathon(db, args[0]);
      if (!event) throw new Error("Readathon no encontrado.");
      console.log(readathon.formatReadathonText(event));
      return;
    }

    if (command === "refresh") {
      const event = await readathon.refreshReadathon(db, args[0]);
      console.log(readathon.formatReadathonText(event));
      return;
    }

    if (command === "add") {
      const [id, discordId, hours, username] = args;
      const event = await readathon.addManualHours(db, id, { discordId, hours, username });
      console.log(readathon.formatReadathonText(event));
      return;
    }

    if (command === "finish") {
      const event = await readathon.finishReadathon(db, args[0]);
      console.log(readathon.formatReadathonText(event));
      return;
    }

    usage();
  } finally {
    await client.close();
  }
}

run().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
