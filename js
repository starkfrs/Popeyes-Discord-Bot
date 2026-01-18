require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType, AttachmentBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [
        Partials.Channel,
        Partials.Message
    ]
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID;

const activeTickets = {};
const TICKETS_FILE = path.join(__dirname, 'tickets.json');

function loadTickets() {
    try {
        if (fs.existsSync(TICKETS_FILE)) {
            const data = fs.readFileSync(TICKETS_FILE, 'utf8');
            const tickets = JSON.parse(data);
            Object.assign(activeTickets, tickets);
            console.log(`✅ Loaded ${Object.keys(tickets).length} tickets from storage`);
        }
    } catch (error) {
        console.error('Error loading tickets:', error);
    }
}

function saveTickets() {
    try {
        fs.writeFileSync(TICKETS_FILE, JSON.stringify(activeTickets, null, 2));
    } catch (error) {
        console.error('Error saving tickets:', error);
    }
}

function generateTranscript(userId) {
    const userTickets = Object.entries(activeTickets).filter(([_, ticket]) => ticket.userId === userId);
    
    if (userTickets.length === 0) {
        return 'No tickets found for this user.';
    }
    
    let transcript = `TICKET TRANSCRIPT\n`;
    transcript += `User ID: ${userId}\n`;
    transcript += `Generated: ${new Date().toLocaleString()}\n`;
    transcript += `Total Tickets: ${userTickets.length}\n`;
    transcript += `${'='.repeat(60)}\n\n`;
    
    userTickets.forEach(([ticketNumber, ticketData]) => {
        transcript += `TICKET #${ticketNumber}\n`;
        transcript += `Category: ${TICKET_OPTIONS[ticketData.type]?.label || 'Unknown'}\n`;
        transcript += `Created: ${new Date(ticketData.createdAt).toLocaleString()}\n`;
        transcript += `Status: ${activeTickets[ticketNumber] ? 'Open' : 'Closed'}\n`;
        if (ticketData.claimedBy) {
            transcript += `Claimed By: ${ticketData.claimedBy.tag}\n`;
        }
        transcript += `-`.repeat(60) + `\n\n`;
    });
    
    return transcript;
}

// Ticket options with emojis
const TICKET_OPTIONS = {
    hr: {
        label: 'Human Resources',
        emoji: '🥼',
        description: 'Employment-related inquiries, staff reports, applications, promotions, or general workforce concerns.',
        roleId: '1460800924854259769',
        deptRoleId: '1460800924854259769'
    },
    pr: {
        label: 'Public Relations',
        emoji: '📣',
        description: 'Affiliate requests, partnerships, events, advertising, or external relations involving Popeyes.',
        roleId: '1460800924854259766',
        deptRoleId: '1460800924854259766'
    },
    gs: {
        label: 'General Support',
        emoji: '🛠️',
        description: 'General questions, basic assistance, or issues that do not fall under other departments.',
        roleId: '1460800924854259768',
        deptRoleId: '1460800924854259768'
    },
    ops: {
        label: 'Operations',
        emoji: '⚙️',
        description: 'Operations-related inquiries, logistics, or other operational concerns.',
        roleId: '1460800924854259767',
        deptRoleId: '1460800924854259767'
    }
};


const STAFF_ROLES = {
    admin: 'ADMIN_ROLE_ID_HERE', // Highest priority - can override anything
    manager: 'MANAGER_ROLE_ID_HERE', // Can override claims
    staff: 'STAFF_ROLE_ID_HERE' // Regular staff
};

const DEPT_ROLES = {
    '1460800924854259769': 'hr', // HR role to HR ticket type
    '1460800924854259766': 'pr', // PR role to PR ticket type
    '1460800924854259767': 'ops', // Ops role to Ops ticket type
    '1460800924854259768': 'gs' // General role to General ticket type
};

// Helper function to lock channel for specific user
async function lockChannelForUser(channel, userId) {
    try {
        // Get the guild
        const guild = channel.guild;
        
        // Deny everyone from viewing/talking
        await channel.permissionOverwrites.create(guild.id, {
            ViewChannel: false,
            SendMessages: false
        });
        
        // Allow specific user to view and talk
        await channel.permissionOverwrites.create(userId, {
            ViewChannel: true,
            SendMessages: true
        });
        
        console.log(`Channel locked for user ${userId}`);
    } catch (error) {
        console.error('Error locking channel:', error);
    }
}

// Helper function to unlock channel
async function unlockChannel(channel) {
    try {
        const guild = channel.guild;
        
        // Remove role overwrite to allow everyone
        const roleOverwrite = channel.permissionOverwrites.cache.find(o => o.id === guild.id);
        if (roleOverwrite) {
            await roleOverwrite.delete();
        }
        
        console.log(`Channel unlocked`);
    } catch (error) {
        console.error('Error unlocking channel:', error);
    }
}

// Generate unique ticket number
function generateTicketNumber() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let ticketNumber = '';
    for (let i = 0; i < 6; i++) {
        ticketNumber += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return activeTickets[ticketNumber] ? generateTicketNumber() : ticketNumber;
}

// Create ticket options for dropdown
function createTicketOptions() {
    return Object.entries(TICKET_OPTIONS).map(([key, option]) => ({
        label: option.label,
        value: key,
        emoji: option.emoji,
        description: option.description.substring(0, 50) + (option.description.length > 50 ? '...' : '')
    }));
}

// Create ticket dropdown menu
function createTicketSelectMenu() {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('ticket_select')
        .setPlaceholder('Select a ticket category...')
        .addOptions(createTicketOptions())
        .setMinValues(1)
        .setMaxValues(1);

    return new ActionRowBuilder().addComponents(selectMenu);
}

// Create welcome embed
function createWelcomeEmbed() {
    const embed = new EmbedBuilder()
        .setTitle('🍟 Welcome to Popeyes Louisiana Kitchen Support! 🍟')
        .setDescription('Thank you for reaching out to our support team! We\'re here to assist you with any questions, concerns, or inquiries you may have.\n\n' +
                       'To ensure your ticket is handled efficiently and by the right team, please carefully select the category below that best matches the nature of your request. This helps us route your inquiry to the appropriate department for a faster resolution.')
        .setColor('#FFDBBB');

    embed.addFields({
        name: '📋 Important Support Guidelines',
        value: '**Response Time:** Our dedicated support team is committed to reviewing and responding to all tickets within 24 hours. We appreciate your patience as we work to provide you with the best assistance possible.\n\n' +
               '**Professional Conduct:** To maintain an organized and efficient support system, please refrain from pinging (@mentioning) or sending direct messages to individual staff members regarding your ticket. All communication should remain within your designated ticket channel. Violation of this policy may result in delayed responses or disciplinary action.\n\n' +
               '**Accuracy Matters:** Please take a moment to review each category option carefully before submitting your ticket. Selecting the correct department ensures your issue is handled by the most qualified team member and reduces resolution time.\n\n' +
               '**Ticket Privacy:** Your ticket is confidential and will only be visible to authorized staff members. Feel free to provide all necessary details to help us assist you effectively.',
        inline: false
    });

    Object.values(TICKET_OPTIONS).forEach(option => {
        embed.addFields({
            name: `${option.emoji} ${option.label}`,
            value: option.description,
            inline: false
        });
    });

    embed.setFooter({ text: 'Popeyes Support Tickets' });

    return embed;
}

client.on('ready', async () => {
    console.log(`✅ ${client.user.tag} has connected to Discord!`);
    client.user.setPresence({
        activities: [{ name: 'Popeyes RBLX Support', type: 'WATCHING' }],
        status: 'online'
    });
    loadTickets();
    
    // Register slash commands
    const commands = [
        new SlashCommandBuilder()
            .setName('say')
            .setDescription('Make the bot send a message')
            .addStringOption(option =>
                option.setName('message')
                    .setDescription('The message to send')
                    .setRequired(true))
    ].map(command => command.toJSON());
    
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, GUILD_ID),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

client.on('messageCreate', async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    // Handle DMs
    if (message.channel.isDMBased()) {
        const user = message.author;
        
        console.log(`DM received from ${user.tag} (${user.id})`);
        console.log(`Active tickets:`, Object.keys(activeTickets).length);
        
        // Check if user has an active ticket
        const userTicket = Object.entries(activeTickets).find(([_, ticket]) => ticket.userId === user.id);
        
        console.log(`User ticket found:`, userTicket ? 'Yes' : 'No');
        
        if (userTicket) {
            // User has a ticket, forward their message to the ticket channel
            const [ticketNumber, ticketData] = userTicket;
            console.log(`Forwarding message to ticket #${ticketNumber}`);
            try {
                const guild = await client.guilds.fetch(GUILD_ID);
                const ticketChannel = guild.channels.cache.get(ticketData.channelId);
                
                if (ticketChannel) {
                    const messageContent = message.content ? `**${user.username}:** ${message.content}` : `**${user.username}:** `;
                    
                    // Store message in ticket history
                    if (activeTickets[ticketNumber]) {
                        activeTickets[ticketNumber].messages.push({
                            author: user.username,
                            role: 'User',
                            content: message.content,
                            timestamp: new Date(),
                            attachments: message.attachments.map(att => att.url)
                        });
                        saveTickets();
                    }
                    
                    if (message.attachments.size > 0) {
                        // Send message with attachments
                        await ticketChannel.send({
                            content: messageContent,
                            files: message.attachments.map(att => att.url)
                        });
                    } else {
                        // Send text-only message
                        await ticketChannel.send(messageContent);
                    }
                    
                    await message.react('✅');
                    console.log(`Message forwarded successfully`);
                } else {
                    console.log(`Ticket channel not found!`);
                    // Remove ticket from storage if channel doesn't exist
                    delete activeTickets[ticketNumber];
                    saveTickets();
                    
                    const errorEmbed = new EmbedBuilder()
                        .setTitle('❌ Ticket Channel Not Found')
                        .setDescription(`Your ticket #${ticketNumber} channel no longer exists. This ticket may have been deleted or closed.`)
                        .setColor('#FF0000');
                    
                    try {
                        await user.send({ embeds: [errorEmbed] });
                    } catch (dmError) {
                        console.error('Could not send error DM to user:', dmError);
                    }
                }
            } catch (error) {
                console.error('Error forwarding DM to ticket:', error);
            }
        } else {
            // No active ticket, send welcome message
            console.log(`Sending welcome message to ${user.tag}`);
            const embed = createWelcomeEmbed();
            const row = createTicketSelectMenu();

            try {
                await user.send({ embeds: [embed], components: [row] });
            } catch (error) {
                console.error('Error sending DM:', error);
            }
        }
        return;
    }
    
    // Handle messages in ticket channels
    const ticketEntry = Object.entries(activeTickets).find(([_, ticket]) => ticket.channelId === message.channel.id);
    
    if (ticketEntry) {
        const [ticketNumber, ticketData] = ticketEntry;
        
        // Handle !claim command
        if (message.content.toLowerCase() === '!claim') {
            activeTickets[ticketNumber].claimedBy = {
                id: message.author.id,
                tag: message.author.tag
            };
            saveTickets();
            
            const claimEmbed = new EmbedBuilder()
                .setTitle('🎫 Ticket Claimed')
                .setDescription(`${message.author} has claimed this ticket.`)
                .setColor('#FFDBBB')
                .setTimestamp();
            
            await message.channel.send({ embeds: [claimEmbed] });
            console.log(`Ticket #${ticketNumber} claimed by ${message.author.tag}`);
            return;
        }
        
        // Handle !close command
        if (message.content.toLowerCase() === '!close') {
            try {
                // Notify channel that ticket will close in 30 seconds
                const closingWarningEmbed = new EmbedBuilder()
                    .setTitle('⏳ Ticket Closing Soon')
                    .setDescription(`${message.author} has initiated the ticket closure process.\n\n**This ticket will automatically close in 30 seconds.**`)
                    .setColor('#FFDBBB')
                    .setTimestamp();
                
                await message.channel.send({ embeds: [closingWarningEmbed] });
                console.log(`Ticket #${ticketNumber} closing in 30 seconds, initiated by ${message.author.tag}`);
                
                // Wait 30 seconds
                await new Promise(resolve => setTimeout(resolve, 30000));
                
                const user = await client.users.fetch(ticketData.userId);
                
                const closeEmbed = new EmbedBuilder()
                    .setTitle('🔒 Support Ticket Closed')
                    .setDescription(`Thank you for contacting Popeyes Support. Your support ticket **#${ticketNumber}** has been successfully reviewed and closed by our team.\n\nWe appreciate your patience throughout this process and hope that your inquiry has been resolved to your satisfaction.`)
                    .addFields(
                        { name: '📋 Ticket Information', value: `**Ticket Number:** #${ticketNumber}\n**Category:** ${TICKET_OPTIONS[ticketData.type].label}\n**Status:** Closed`, inline: false },
                        { name: '👤 Handled By', value: `${message.author.tag}`, inline: true },
                        { name: '📅 Closed On', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                        { name: '💬 Need Additional Assistance?', value: 'If your issue has not been fully resolved, or if you have any additional questions or concerns, please don\'t hesitate to send me another direct message. Creating a new ticket is quick and easy - simply message me and select the appropriate category.\n\nOur support team is here to help you Monday through Sunday, and we strive to respond to all inquiries within 24 hours.', inline: false },
                        { name: '⭐ We Value Your Feedback', value: 'Your experience matters to us. If you have any feedback about your support experience, we\'d love to hear from you. Feel free to mention it in your next ticket or reach out to our management team.', inline: false }
                    )
                    .setColor('#FFDBBB')
                    .setFooter({ text: 'Popeyes Support Team | Thank you for your patience' })
                    .setTimestamp();
                
                await user.send({ embeds: [closeEmbed] });
                
                // Remove from active tickets
                delete activeTickets[ticketNumber];
                saveTickets();
                console.log(`Ticket #${ticketNumber} closed by ${message.author.tag}`);
                
                // Notify channel
                const channelCloseEmbed = new EmbedBuilder()
                    .setTitle('🔒 Ticket Closed')
                    .setDescription(`This ticket has been closed by ${message.author}.\nUser has been notified.\n\n**Channel will be deleted momentarily...**`)
                    .setColor('#FFDBBB')
                    .setTimestamp();
                
                await message.channel.send({ embeds: [channelCloseEmbed] });
                
                // Delete the channel after a brief moment
                setTimeout(async () => {
                    try {
                        await message.channel.delete(`Ticket #${ticketNumber} closed by ${message.author.tag}`);
                        console.log(`Ticket channel #${ticketNumber} deleted`);
                    } catch (deleteError) {
                        console.error('Error deleting ticket channel:', deleteError);
                    }
                }, 3000); // 3 second delay to allow staff to see the final message
                
            } catch (error) {
                console.error('Error closing ticket:', error);
                await message.channel.send('❌ Error closing ticket. The user may have DMs disabled.');
            }
            return;
        }
        
        // Handle !transcript command
        if (message.content.toLowerCase().startsWith('!transcript')) {
            const args = message.content.split(' ');
            if (args.length < 2) {
                await message.reply('Usage: `!transcript <ticketnumber>` or `!transcript current`');
                return;
            }
            
            let ticketNum;
            const arg = args[1].toLowerCase();
            
            if (arg === 'current') {
                // Use current ticket
                ticketNum = ticketNumber;
            } else {
                // Use provided ticket number
                ticketNum = arg.toUpperCase();
            }
            
            if (!activeTickets[ticketNum]) {
                await message.reply(`❌ Ticket #${ticketNum} not found.`);
                return;
            }
            
            try {
                const ticket = activeTickets[ticketNum];
                let transcript = `TICKET TRANSCRIPT\n`;
                transcript += `Ticket #: ${ticketNum}\n`;
                transcript += `Category: ${TICKET_OPTIONS[ticket.type]?.label || 'Unknown'}\n`;
                transcript += `Created: ${new Date(ticket.createdAt).toLocaleString()}\n`;
                if (ticket.claimedBy) {
                    transcript += `Claimed By: ${ticket.claimedBy.tag}\n`;
                }
                transcript += `${'='.repeat(60)}\n\n`;
                
                if (ticket.messages.length === 0) {
                    transcript += 'No messages in this ticket yet.\n';
                } else {
                    ticket.messages.forEach(msg => {
                        const time = new Date(msg.timestamp).toLocaleString();
                        transcript += `[${time}] **${msg.author}** (${msg.role}):\n`;
                        transcript += `${msg.content}\n`;
                        if (msg.attachments && msg.attachments.length > 0) {
                            transcript += `Attachments: ${msg.attachments.join(', ')}\n`;
                        }
                        transcript += `\n`;
                    });
                }
                
                const transcriptFile = new AttachmentBuilder(
                    Buffer.from(transcript),
                    { name: `transcript-${ticketNum}.txt` }
                );
                
                await message.reply({
                    content: `📋 Transcript for ticket #${ticketNum}:`,
                    files: [transcriptFile]
                });
                console.log(`Transcript generated for ticket #${ticketNum} by ${message.author.tag}`);
            } catch (error) {
                console.error('Error generating transcript:', error);
                await message.reply('❌ Error generating transcript.');
            }
            return;
        }
        
        // Forward regular messages to user
        try {
            const user = await client.users.fetch(ticketData.userId);
            
            const messageContent = message.content ? `**${message.author.username}:** ${message.content}` : `**${message.author.username}:** `;
            
            // Store message in ticket history
            activeTickets[ticketNumber].messages.push({
                author: message.author.username,
                role: 'Staff',
                content: message.content,
                timestamp: new Date(),
                attachments: message.attachments.map(att => att.url)
            });
            saveTickets();
            
            if (message.attachments.size > 0) {
                // Send message with attachments
                await user.send({
                    content: messageContent,
                    files: message.attachments.map(att => att.url)
                });
            } else {
                // Send text-only message
                await user.send(messageContent);
            }
            
            // React with checkmark to indicate message was sent
            await message.react('✅');
        } catch (error) {
            console.error('Error forwarding staff message to user:', error);
            await message.react('❌');
        }
    }
});

client.on('interactionCreate', async (interaction) => {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'say') {
            // Check if user is authorized
            if (interaction.user.id !== '924851456111169577') {
                await interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
                return;
            }
            
            const message = interaction.options.getString('message');
            
            try {
                await interaction.channel.send(message);
                await interaction.reply({ content: '✅ Message sent!', ephemeral: true });
            } catch (error) {
                console.error('Error sending message:', error);
                await interaction.reply({ content: '❌ Failed to send message.', ephemeral: true });
            }
            return;
        }
    }
    
    // Handle button interactions
    if (interaction.isButton()) {
        const customId = interaction.customId;
        
        // Handle claim button
        if (customId.startsWith('ticket_claim_')) {
            const ticketNumber = customId.replace('ticket_claim_', '');
            const ticketData = activeTickets[ticketNumber];
            
            if (!ticketData) {
                await interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
                return;
            }
            
            activeTickets[ticketNumber].claimedBy = {
                id: interaction.user.id,
                tag: interaction.user.tag,
                roles: interaction.member.roles.cache.map(r => r.id)
            };
            saveTickets();
            
            // Lock the channel for this user only
            await lockChannelForUser(interaction.channel, interaction.user.id);
            
            const claimEmbed = new EmbedBuilder()
                .setTitle('🎫 Ticket Claimed')
                .setDescription(`${interaction.user} has claimed this ticket.\n\n⚠️ This channel is now locked. Only the claimer can send messages unless overridden.`)
                .setColor('#FFDBBB')
                .setTimestamp();
            
            await interaction.channel.send({ embeds: [claimEmbed] });
            await interaction.reply({ content: '✅ Ticket claimed! Channel is now locked for you.', ephemeral: true });
            console.log(`Ticket #${ticketNumber} claimed by ${interaction.user.tag}`);
            return;
        }
        
        // Handle override claim button
        if (customId.startsWith('ticket_override_')) {
            const ticketNumber = customId.replace('ticket_override_', '');
            const ticketData = activeTickets[ticketNumber];
            
            if (!ticketData) {
                await interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
                return;
            }
            
            const previousClaimer = ticketData.claimedBy ? ticketData.claimedBy.tag : 'No one';
            
            activeTickets[ticketNumber].claimedBy = {
                id: interaction.user.id,
                tag: interaction.user.tag,
                roles: interaction.member.roles.cache.map(r => r.id)
            };
            saveTickets();
            
            // Lock the channel for the new claimer
            await lockChannelForUser(interaction.channel, interaction.user.id);
            
            const overrideEmbed = new EmbedBuilder()
                .setTitle('🔄 Ticket Claim Overridden')
                .setDescription(`${interaction.user} has overridden the ticket claim.\n\n**Previous Claimer:** ${previousClaimer}\n**New Claimer:** ${interaction.user.tag}\n\n⚠️ Channel is now locked for the new claimer.`)
                .setColor('#FFDBBB')
                .setTimestamp();
            
            await interaction.channel.send({ embeds: [overrideEmbed] });
            await interaction.reply({ content: '✅ Ticket claim overridden!', ephemeral: true });
            console.log(`Ticket #${ticketNumber} override by ${interaction.user.tag} (previous: ${previousClaimer})`);
            return;
        }
        
        // Handle close button
        if (customId.startsWith('ticket_close_')) {
            const ticketNumber = customId.replace('ticket_close_', '');
            const ticketData = activeTickets[ticketNumber];
            
            if (!ticketData) {
                await interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
                return;
            }
            
            try {
                // Notify channel that ticket will close in 30 seconds
                const closingWarningEmbed = new EmbedBuilder()
                    .setTitle('⏳ Ticket Closing Soon')
                    .setDescription(`${interaction.user} has initiated the ticket closure process.\n\n**This ticket will automatically close in 30 seconds.**`)
                    .setColor('#FFDBBB')
                    .setTimestamp();
                
                await interaction.channel.send({ embeds: [closingWarningEmbed] });
                await interaction.reply({ content: '✅ Closing ticket in 30 seconds...', ephemeral: true });
                console.log(`Ticket #${ticketNumber} closing in 30 seconds, initiated by ${interaction.user.tag}`);
                
                // Wait 30 seconds
                await new Promise(resolve => setTimeout(resolve, 30000));
                
                const user = await client.users.fetch(ticketData.userId);
                
                const closeEmbed = new EmbedBuilder()
                    .setTitle('🔒 Support Ticket Closed')
                    .setDescription(`Thank you for contacting Popeyes Support. Your support ticket **#${ticketNumber}** has been successfully reviewed and closed by our team.\n\nWe appreciate your patience throughout this process and hope that your inquiry has been resolved to your satisfaction.`)
                    .addFields(
                        { name: '📋 Ticket Information', value: `**Ticket Number:** #${ticketNumber}\n**Category:** ${TICKET_OPTIONS[ticketData.type].label}\n**Status:** Closed`, inline: false },
                        { name: '👤 Handled By', value: `${interaction.user.tag}`, inline: true },
                        { name: '📅 Closed On', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                        { name: '💬 Need Additional Assistance?', value: 'If your issue has not been fully resolved, or if you have any additional questions or concerns, please don\'t hesitate to send me another direct message. Creating a new ticket is quick and easy - simply message me and select the appropriate category.\n\nOur support team is here to help you Monday through Sunday, and we strive to respond to all inquiries within 24 hours.', inline: false },
                        { name: '⭐ We Value Your Feedback', value: 'Your experience matters to us. If you have any feedback about your support experience, we\'d love to hear from you. Feel free to mention it in your next ticket or reach out to our management team.', inline: false }
                    )
                    .setColor('#FFDBBB')
                    .setFooter({ text: 'Popeyes Support Team | Thank you for your patience' })
                    .setTimestamp();
                
                await user.send({ embeds: [closeEmbed] });
                
                // Remove from active tickets
                delete activeTickets[ticketNumber];
                saveTickets();
                console.log(`Ticket #${ticketNumber} closed by ${interaction.user.tag}`);
                
                // Notify channel
                const channelCloseEmbed = new EmbedBuilder()
                    .setTitle('🔒 Ticket Closed')
                    .setDescription(`This ticket has been closed by ${interaction.user}.\nUser has been notified.\n\n**Channel will be deleted momentarily...**`)
                    .setColor('#FFDBBB')
                    .setTimestamp();
                
                await interaction.channel.send({ embeds: [channelCloseEmbed] });
                
                // Delete the channel after a brief moment
                setTimeout(async () => {
                    try {
                        await interaction.channel.delete(`Ticket #${ticketNumber} closed by ${interaction.user.tag}`);
                        console.log(`Ticket channel #${ticketNumber} deleted`);
                    } catch (deleteError) {
                        console.error('Error deleting ticket channel:', deleteError);
                    }
                }, 3000);
                
            } catch (error) {
                console.error('Error closing ticket:', error);
                await interaction.reply({ content: '❌ Error closing ticket. The user may have DMs disabled.', ephemeral: true });
            }
            return;
        }
        
        // Handle transcript button
        if (customId.startsWith('ticket_transcript_')) {
            const ticketNumber = customId.replace('ticket_transcript_', '');
            const ticket = activeTickets[ticketNumber];
            
            if (!ticket) {
                await interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
                return;
            }
            
            try {
                let transcript = `TICKET TRANSCRIPT\n`;
                transcript += `Ticket #: ${ticketNumber}\n`;
                transcript += `Category: ${TICKET_OPTIONS[ticket.type]?.label || 'Unknown'}\n`;
                transcript += `Created: ${new Date(ticket.createdAt).toLocaleString()}\n`;
                if (ticket.claimedBy) {
                    transcript += `Claimed By: ${ticket.claimedBy.tag}\n`;
                }
                transcript += `${'='.repeat(60)}\n\n`;
                
                if (ticket.messages.length === 0) {
                    transcript += 'No messages in this ticket yet.\n';
                } else {
                    ticket.messages.forEach(msg => {
                        const time = new Date(msg.timestamp).toLocaleString();
                        transcript += `[${time}] **${msg.author}** (${msg.role}):\n`;
                        transcript += `${msg.content}\n`;
                        if (msg.attachments && msg.attachments.length > 0) {
                            transcript += `Attachments: ${msg.attachments.join(', ')}\n`;
                        }
                        transcript += `\n`;
                    });
                }
                
                const transcriptFile = new AttachmentBuilder(
                    Buffer.from(transcript),
                    { name: `transcript-${ticketNumber}.txt` }
                );
                
                await interaction.reply({
                    content: `📋 Transcript for ticket #${ticketNumber}:`,
                    files: [transcriptFile],
                    ephemeral: true
                });
                console.log(`Transcript generated for ticket #${ticketNumber} by ${interaction.user.tag}`);
            } catch (error) {
                console.error('Error generating transcript:', error);
                await interaction.reply({ content: '❌ Error generating transcript.', ephemeral: true });
            }
            return;
        }
    }

    if (interaction.customId === 'ticket_select') {
        await interaction.deferReply({ ephemeral: true });

        let ticketType = interaction.values[0];
        const user = interaction.user;
        
        // Auto-assign ticket type based on user's department role
        const member = interaction.member;
        if (member) {
            for (const [roleId, deptType] of Object.entries(DEPT_ROLES)) {
                if (member.roles.cache.has(roleId)) {
                    ticketType = deptType;
                    console.log(`Auto-assigned ticket type ${ticketType} based on user's department role`);
                    break;
                }
            }
        }

        try {
            const guild = await client.guilds.fetch(GUILD_ID);
            const category = guild.channels.cache.get(TICKET_CATEGORY_ID);

            if (!guild || !category) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('Could not access server or ticket category. Please contact an administrator.')
                    .setColor('#FFDBBB');
                await user.send({ embeds: [errorEmbed] });
                await interaction.editReply({ content: '❌ Error: Server or category not found.', ephemeral: true });
                return;
            }

            // Generate ticket number
            const ticketNumber = generateTicketNumber();

            // Create channel name
            const channelName = `ticket-${ticketNumber.toLowerCase()}`;

            // Create ticket channel (user won't have access, they'll DM the bot)
            const ticketChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: category.id, // use category id to avoid object coercion issues
                reason: `Ticket #${ticketNumber} created by ${user.tag} for ${TICKET_OPTIONS[ticketType].label}`,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    }
                ]
            });

            // Store ticket info
            activeTickets[ticketNumber] = {
                userId: user.id,
                channelId: ticketChannel.id,
                type: ticketType,
                createdAt: new Date(),
                messages: []
            };
            saveTickets();
            
            console.log(`Ticket #${ticketNumber} created for user ${user.tag} (${user.id})`);
            console.log(`Active tickets:`, Object.keys(activeTickets));

            // Create embed for ticket
            const ticketEmbed = new EmbedBuilder()
                .setTitle(`🎫 Ticket #${ticketNumber}`)
                .setDescription(
                    `**Category:** ${TICKET_OPTIONS[ticketType].label}\n` +
                    `**Created by:** ${user}\n` +
                    `**User ID:** \`${user.id}\`\n` +
                    `**Created at:** <t:${Math.floor(Date.now() / 1000)}:F>`
                )
                .setColor('#FFDBBB');

            ticketEmbed.addFields(
                { name: 'Status', value: '🟢 Open', inline: false },
                {
                    name: 'Staff Guidelines',
                    value: '• Respond to the user via this channel\n• Click the Claim button below to claim the ticket when you start working on it\n• Communicate with other staff in the Staff Discussion thread\n• Document all steps and findings\n• Be professional and courteous\n• Click the Close button when the issue is resolved\n• ⚠️ **Only claim and respond to tickets within your department.** Unauthorized ticket handling may result in disciplinary action.',
                    inline: false
                }
            );
            
            // Create action buttons
            const buttonRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`ticket_claim_${ticketNumber}`)
                        .setLabel('Claim Ticket')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`ticket_override_${ticketNumber}`)
                        .setLabel('Override Claim')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId(`ticket_transcript_${ticketNumber}`)
                        .setLabel('View Transcript')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId(`ticket_close_${ticketNumber}`)
                        .setLabel('Close Ticket')
                        .setStyle(ButtonStyle.Danger)
                );
            // Ping the appropriate role based on ticket category and the universal role
            const roleId = TICKET_OPTIONS[ticketType].roleId;
            const universalRoleId = '1460800924854259765';
            await ticketChannel.send({ 
                content: `<@&${roleId}> <@&${universalRoleId}> New ticket opened!`,
                embeds: [ticketEmbed],
                components: [buttonRow]
            });
            
            // Create staff discussion thread
            const thread = await ticketChannel.threads.create({
                name: 'Staff Discussion',
                autoArchiveDuration: 1440,
                reason: `Staff discussion thread for ticket #${ticketNumber}`
            });
            
            const threadEmbed = new EmbedBuilder()
                .setTitle('📋 Staff Discussion Thread')
                .setDescription('Use this thread to discuss the ticket with other staff members. This is a private space for internal communication and notes.')
                .addFields(
                    { name: 'Ticket Number', value: `#${ticketNumber}`, inline: true },
                    { name: 'Category', value: TICKET_OPTIONS[ticketType].label, inline: true },
                    { name: 'User', value: `${user.tag}`, inline: true },
                    { name: 'Guidelines for Discussion', value: '• Share insights and findings\n• Document steps taken\n• Coordinate responses with other staff members\n• Keep professional tone\n• Do not share sensitive information outside this thread' }
                )
                .setColor('#FFDBBB');
            
            await thread.send({ embeds: [threadEmbed] });

            // Notify user
            const confirmEmbed = new EmbedBuilder()
                .setTitle('✅ Support Ticket Created')
                .setDescription('Your support ticket has been successfully created!')
                .addFields(
                    { name: 'Ticket Number', value: `#${ticketNumber}`, inline: true },
                    { name: 'Category', value: TICKET_OPTIONS[ticketType].label, inline: true },
                    { name: 'Next Steps', value: 'Continue sending messages here. A staff member will respond to your ticket shortly.', inline: false }
                )
                .setColor('#FFDBBB')
                .setTimestamp();
            await user.send({ embeds: [confirmEmbed] });

            await interaction.editReply({
                content: `✅ Ticket #${ticketNumber} created successfully! A staff member will respond to your DMs shortly.`,
                ephemeral: true
            });

        } catch (error) {
            console.error('Error creating ticket:', error);
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error Creating Ticket')
                .setDescription(`An error occurred: ${error.message}`)
                .setColor('#FFDBBB');
            await user.send({ embeds: [errorEmbed] });
            await interaction.editReply({
                content: `❌ Error creating ticket: ${error.message}`,
                ephemeral: true
            });
        }
    }
});

client.login(DISCORD_TOKEN);
