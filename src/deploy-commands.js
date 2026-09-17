const { REST, Routes } = require('discord.js');
const config = require('./config');
const commands = require('./commands');

const body = commands.map((c) => c.data.toJSON());
const rest = new REST().setToken(config.token);

(async () => {
  try {
    const route = config.guildId
      ? Routes.applicationGuildCommands(config.clientId, config.guildId)
      : Routes.applicationCommands(config.clientId);

    console.log(
      `Registering ${body.length} slash command(s) ${
        config.guildId ? `to guild ${config.guildId}` : 'globally'
      }...`
    );
    await rest.put(route, { body });
    console.log('Done.');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
