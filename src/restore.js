require('dotenv').config();
const fs = require('fs');
const path = require('path');
const parser = require('./parser');
const BotSettings = require('./models/botSettings.model');
const Owner = require('./models/owner.model');

async function restore() {
  const directory = 'dumps';

  let files = [];
  try {
    files = fs.readdirSync(directory);
  } catch {}

  if (!files) {
    throw new Error('No dump files..');
  }

  let timestamp = 0;
  let dumpFile = '';

  files.forEach((file) => {
    const regex = /^dossar_bot_(\d+)\.dump\.json$/;
    const match = regex.exec(file);

    if (match) {
      const number = parseInt(match[1]);
      if (number > timestamp) {
        timestamp = number;
        dumpFile = file;
      }
    }
  });

  if (!dumpFile) {
    console.log('[WARN] No dump file..');
    return;
  }

  const filePath = path.join(directory, dumpFile);
  const dumpData = JSON.parse(fs.readFileSync(filePath));

  checkDump(dumpData);
  const botSettingsInstance = await BotSettings.findOne();
  const botOwnerInstance = await Owner.findOne();
  botSettingsInstance.token = dumpData.settings.token;
  await botSettingsInstance.save();
  botOwnerInstance.id = dumpData.owner.id;
  botOwnerInstance.name = dumpData.owner.name;
  botOwnerInstance.contacts = dumpData.owner.contacts;
  botOwnerInstance.phone = dumpData.owner.phone;
  await botOwnerInstance.save();
  for await (let app of dumpData.applications) {
    const applicationInstance = await parser.models.Application.findOne({ index: app.index });
    if (!applicationInstance) {
      console.log('[WARN] Unknown application \n' + JSON.stringify(app));
      continue;
    }
    applicationInstance.subscribers = app.subscribers;
    await applicationInstance.save();
  }
}

function checkDump(dumpData) {
  if (
    !dumpData.settings ||
    !dumpData.owner ||
    !dumpData.applications ||
    !dumpData.settings.token ||
    !dumpData.owner.id ||
    !dumpData.owner.name ||
    !dumpData.owner.contacts ||
    !dumpData.owner.phone ||
    !dumpData.applications.every((app) => app.index && app.subscribers)
  ) {
    throw new Error('Wrong dupm file');
  }
}

async function main() {
  require('./db');
  await restore();
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = restore;
