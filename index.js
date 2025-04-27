const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const express = require('express');
const { token } = process.env;

const app = express();
const port = process.env.PORT || 3000;

// Création du client Discord
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// Commandes en mémoire pour infractions
const infractions = {};

// Faux serveur HTTP pour Render
app.get('/', (req, res) => {
  res.send('Le bot fonctionne !');
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

// Quand le bot est prêt
client.once('ready', () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
});

// Commande ?lock
client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;
  
  const prefix = '?';
  
  // Commande de verrouillage du salon
  if (message.content.startsWith(`${prefix}lock`)) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return message.reply('Vous n\'avez pas la permission de verrouiller ce salon.');
    }
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
    message.reply('Salon verrouillé.');
  }

  // Commande de déverrouillage du salon
  if (message.content.startsWith(`${prefix}unlock`)) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return message.reply('Vous n\'avez pas la permission de déverrouiller ce salon.');
    }
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
    message.reply('Salon déverrouillé.');
  }

  // Commande de bannissement
  if (message.content.startsWith(`${prefix}ban`)) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return message.reply('Vous n\'avez pas la permission de bannir un utilisateur.');
    }
    const user = message.mentions.users.first();
    const reason = message.content.split(' ').slice(2).join(' ') || 'Aucune raison fournie';
    if (!user) return message.reply('Veuillez mentionner un utilisateur à bannir.');
    await message.guild.members.ban(user, { reason });
    message.reply(`${user.tag} a été banni. Raison: ${reason}`);
  }

  // Commande unban
  if (message.content.startsWith(`${prefix}unban`)) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return message.reply('Vous n\'avez pas la permission de débannir un utilisateur.');
    }
    const userId = message.content.split(' ')[1];
    if (!userId) return message.reply('Veuillez spécifier un ID d\'utilisateur à débannir.');
    await message.guild.members.unban(userId);
    message.reply(`L'utilisateur avec l'ID ${userId} a été débanni.`);
  }

  // Commande de warning
  if (message.content.startsWith(`${prefix}warn`)) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return message.reply('Vous n\'avez pas la permission d\'avertir un utilisateur.');
    }
    const user = message.mentions.users.first();
    const reason = message.content.split(' ').slice(2).join(' ') || 'Aucune raison fournie';
    if (!user) return message.reply('Veuillez mentionner un utilisateur à avertir.');
    
    if (!infractions[user.id]) infractions[user.id] = { warns: [] };
    infractions[user.id].warns.push({ reason, date: new Date() });
    
    message.reply(`${user.tag} a été averti. Raison: ${reason}`);
  }

  // Commande unwarn
  if (message.content.startsWith(`${prefix}unwarn`)) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return message.reply('Vous n\'avez pas la permission de retirer un avertissement.');
    }
    const user = message.mentions.users.first();
    if (!user || !infractions[user.id] || infractions[user.id].warns.length === 0) {
      return message.reply('Cet utilisateur n\'a pas d\'avertissements à retirer.');
    }
    
    infractions[user.id].warns.pop();
    message.reply(`${user.tag} a été unaverti.`);
  }

  // Commande infractions
  if (message.content.startsWith(`${prefix}infractions`)) {
    const user = message.mentions.users.first();
    if (!user || !infractions[user.id] || infractions[user.id].warns.length === 0) {
      return message.reply('Cet utilisateur n\'a pas d\'infractions.');
    }

    const embed = new EmbedBuilder()
      .setTitle(`${user.tag} - Infractions`)
      .setDescription(infractions[user.id].warns.map((warn, index) => `${index + 1}. Raison: ${warn.reason} - Date: ${warn.date}`).join('\n'))
      .setColor('RED');

    message.reply({ embeds: [embed] });
  }

  // Commande help
  if (message.content.startsWith(`${prefix}help`)) {
    const embed = new EmbedBuilder()
      .setTitle('Commandes du Bot')
      .addFields(
        { name: 'Modération', value: '`?lock`, `?unlock`, `?ban`, `?unban`, `?warn`, `?unwarn`, `?infractions`' },
        { name: 'Tickets', value: '`?ticket setup`, `?ticket close`, `?ticket claim`' },
        { name: 'Anti-Spam', value: 'Le bot bloque les liens, les spams et les @everyone.' }
      )
      .setColor('BLUE');

    message.reply({ embeds: [embed] });
  }
});

// Commande ticket setup
client.on('messageCreate', async (message) => {
  if (message.content === '?ticket setup') {
    const button = {
      type: 1,
      components: [
        {
          type: 2,
          label: 'Ouvrir un ticket',
          style: 1,
          custom_id: 'open_ticket',
        },
      ],
    };

    await message.channel.send({ content: 'Cliquez sur le bouton pour ouvrir un ticket.', components: button });
  }
});

// Commande ticket claim
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'open_ticket') {
    const channel = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.username}`,
      type: 'GUILD_TEXT',
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [PermissionsBitField.Flags.SendMessages],
        },
        {
          id: interaction.user.id,
          allow: [PermissionsBitField.Flags.SendMessages],
        },
      ],
    });

    await channel.send(`Ticket ouvert par ${interaction.user.tag}.`);
    interaction.reply({ content: 'Votre ticket a été créé !', ephemeral: true });
  }
});

// Lancement du bot
client.login(token);
