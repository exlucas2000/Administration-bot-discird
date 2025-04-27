const { Client, GatewayIntentBits, Partials, Collection, EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// ======== Faux serveur HTTP pour Render ========
const app = express();
app.get('/', (req, res) => {
  res.send('Bot is alive!');
});
app.listen(3000, () => {
  console.log('Faux serveur HTTP lancé pour Render');
});

// ======== Structures de données ========
const warns = new Map();

// ======== Anti-spam, anti-lien, anti-everyone ========
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
  
  if (/(https?:\/\/[^\s]+)/.test(message.content)) {
    await message.delete();
    return message.channel.send(`${message.author} Les liens sont interdits.`);
  }
  
  if (message.content.includes('@everyone') || message.content.includes('@here')) {
    await message.delete();
    return message.channel.send(`${message.author} Mentionner everyone est interdit.`);
  }
  
  const spamWords = ["discord.gg", "join my server", "free nitro"];
  if (spamWords.some(w => message.content.toLowerCase().includes(w))) {
    await message.delete();
    return message.channel.send(`${message.author} Spam détecté et supprimé.`);
  }
});

// ======== Commandes ========
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, member, guild, options } = interaction;

  if (commandName === 'help') {
    const embed = new EmbedBuilder()
      .setTitle('Commandes disponibles')
      .setDescription('`/lock`, `/unlock`, `/ban`, `/unban`, `/banlist`, `/warn`, `/unwarn`, `/mute`, `/unmute`, `/infractions`, `/ticketsetup`')
      .setColor('Blue');
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ======= LOCK / UNLOCK =======
  if (commandName === 'lock') {
    await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
    await interaction.reply('Salon verrouillé.');
  }

  if (commandName === 'unlock') {
    await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: true });
    await interaction.reply('Salon déverrouillé.');
  }

  // ======= BAN / UNBAN =======
  if (commandName === 'ban') {
    const user = options.getUser('utilisateur');
    const reason = options.getString('raison') || "Pas de raison.";
    await guild.members.ban(user.id, { reason });
    await interaction.reply(`${user.tag} a été banni.`);
  }

  if (commandName === 'unban') {
    const userId = options.getString('userid');
    await guild.bans.remove(userId);
    await interaction.reply(`Utilisateur avec ID ${userId} débanni.`);
  }

  if (commandName === 'banlist') {
    const bans = await guild.bans.fetch();
    const list = bans.map(b => `${b.user.tag} (${b.user.id})`).join("\n") || "Aucun banni.";
    await interaction.reply(`Liste des bannis:\n${list}`);
  }

  // ======= WARN / UNWARN / INFRACTIONS =======
  if (commandName === 'warn') {
    const user = options.getUser('utilisateur');
    const reason = options.getString('raison') || "Pas de raison.";
    if (!warns.has(user.id)) warns.set(user.id, []);
    warns.get(user.id).push({ reason, date: new Date() });
    await interaction.reply(`${user.tag} a été averti.`);
  }

  if (commandName === 'unwarn') {
    const user = options.getUser('utilisateur');
    warns.delete(user.id);
    await interaction.reply(`${user.tag} n'a plus d'avertissements.`);
  }

  if (commandName === 'infractions') {
    const user = options.getUser('utilisateur');
    const userWarns = warns.get(user.id) || [];
    if (userWarns.length === 0) return interaction.reply('Aucune infraction.');
    const list = userWarns.map((w, i) => `${i + 1}. ${w.reason} (${w.date.toLocaleDateString()})`).join("\n");
    await interaction.reply(`Infractions de ${user.tag}:\n${list}`);
  }

  // ======= MUTE / UNMUTE =======
  if (commandName === 'mute') {
    const user = options.getMember('utilisateur');
    await user.timeout(60 * 60 * 1000); // 1 heure
    await interaction.reply(`${user.user.tag} est muté pendant 1h.`);
  }

  if (commandName === 'unmute') {
    const user = options.getMember('utilisateur');
    await user.timeout(null);
    await interaction.reply(`${user.user.tag} est démute.`);
  }
});

// ======== Système de Tickets ========
client.on('interactionCreate', async interaction => {
  if (interaction.isButton()) {
    const { customId, guild, user } = interaction;

    if (customId === 'open_ticket') {
      const ticketChannel = await guild.channels.create({
        name: `ticket-${user.username}`,
        type: 0,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      });

      const panel = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder().setCustomId('claim_ticket').setLabel('Prendre en charge').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('close_ticket').setLabel('Fermer').setStyle(ButtonStyle.Danger)
        );

      await ticketChannel.send({ content: 'Panel de ticket', components: [panel] });
      await interaction.reply({ content: `Ton ticket a été créé: ${ticketChannel}`, ephemeral: true });
    }

    if (customId === 'close_ticket') {
      await interaction.channel.delete();
    }

    if (customId === 'claim_ticket') {
      await interaction.reply({ content: `${interaction.user} a pris en charge ce ticket.`, ephemeral: false });
    }
  }
});

// ======== Commande /ticketsetup ========
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ticketsetup') {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('open_ticket')
          .setLabel('Ouvrir un ticket')
          .setStyle(ButtonStyle.Success)
      );

    const embed = new EmbedBuilder()
      .setTitle('Support Ticket')
      .setDescription('Clique sur le bouton pour créer un ticket.')
      .setColor('Green');

    await interaction.reply({ embeds: [embed], components: [row] });
  }
});

// ======== Ready Event ========
client.once('ready', () => {
  console.log(`${client.user.tag} est prêt !`);
});

// ======== Login ========
client.login(process.env.TOKEN);
