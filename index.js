const { Client, GatewayIntentBits, Collection, ApplicationCommandOptionType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { CosmWasmClient } = require('@cosmjs/cosmwasm-stargate');
const fs = require('fs');
const client = new Client({ intents: [GatewayIntentBits.Guilds,] });
const config = require('./config.json')
const token = config.BOT_ID


const rpcEndpoint = 'https://sei-m.rpc.n0ok.net/';/
const excludeAddress = 'sei152u2u0lqc27428cuf8dx48k8saua74m6nql5kgvsu4rfeqm547rsnhy4y9';   // excludes Pallet contract from output

const listOnlyAddresses = true;  
const listAllHolders = true; 


client.commands = new Collection();


// command to get all unlisted owners of an nft collection
const ownersCommand = {
  name: 'owners',
  description: 'Get owners for a given SEI contract address',
  options: [
    {
      name: 'address',
      type: 3,
      description: 'The SEI contract address of the owners to get',
      required: true,
    },
	{
		name: 'starting_id',
		type: 3,
		description: 'Starting token number to query',
		required: true,
	},
	{
		name: 'ending_id',
		type: 3,
		description: 'Ending token number to query',
		required: true,
	},
	{
		name: 'batch_size',
		type: 3,
		description: "How many token id's to query",
		required: true,
	},
	{
		name: 'save_file',
		type: 3,
		description: 'Collection name or filename to save addresses to',
		required: true,
	},	
  ]
};


// command to get nft metadata of a specific token from a specific CA
const metadataCommand = {
  name: 'flex',
  description: 'Get metadata for a specific NFT',
  options: [
    {
      name: 'address',
      type: 3,
      description: 'The SEI collection contract address of the NFT',
      required: true,
    },
    {
      name: 'token_id',
      type: 3,
      description: 'The token ID of the NFT to get metadata for',
      required: true,
    },
  ]
};

// command to get info on Sei Boys Genesis
const boysInfoCommand = {
  name: 'boys',
  description: 'Get current collection info on the of Sei Boys Collection',
};


client.once('ready', async () => {
  console.log('Ready!');
  
  const data = [
    ownersCommand,
    metadataCommand,
    boysInfoCommand
  ];
  await client.application.commands.set(data);
});

client.on('interactionCreate', async interaction => {
	if (!interaction.isCommand()) return;
  
	const { commandName, options } = interaction;
  
	if (commandName === 'owners') {
	  const address = options.getString('address');
	  const start_id = parseInt(options.getString('starting_id'), 10);
	  const end_id = parseInt(options.getString('ending_id'), 10); 
	  const size = parseInt(options.getString('batch_size'), 10); 
	  const filename = options.getString('save_file');
	  const collectionname = options.getString('save_file')
  
	  await interaction.deferReply();
	  try {
      const response = await queryTokenOwnersAmount(address, start_id, end_id, size, collectionname, filename);
      await interaction.editReply(response);
    } catch (error) {
      console.error(`An error occurred: ${error.message}`);
      await interaction.editReply({ content: 'An error occurred while processing your request. Please try again later.', files: [] });
    }
	} else if (commandName === 'flex') {
    // New code to handle 'metadata' command
    const contractAddress = options.getString('address');
    const tokenId = options.getString('token_id');

    await interaction.deferReply();
    try {
      const metadata = await queryNFTMetadata(contractAddress, tokenId);
      const { default: fetch } = await import('node-fetch');
      const metadata_uri =  await fetch(metadata.token_uri)
      const token_metadata = await metadata_uri.json()
      const name = token_metadata.name;
      let imageUrl = token_metadata.image;

      const embed = new EmbedBuilder()
                .setTitle(`${name}`)
                .setImage(imageUrl);
      await interaction.editReply({ embeds: [embed] });;
    } catch (error) {
      console.error(`An error occurred: ${error.message}`);
      await interaction.editReply({ content: 'Failed to retrieve metadata. Please make sure the contract address and token ID are correct.' });
    }
    } else if (commandName === 'boys') {
      await interaction.deferReply();
      try {
          const collectionInfo = await queryCollectionInfo();
          const { logoUrl, name, supply, owners, auction_count, floor, volume, volume_24hr, num_sales_24hr } = collectionInfo;

          const embed = new EmbedBuilder()
              .setTitle(`${name}`)
              .setImage(logoUrl)
              .addFields(
                  { name: 'Supply', value: supply.toString(), inline: true },
                  { name: 'Owners', value: owners.toString(), inline: true },
                  { name: 'Floor', value: floor.toString(), inline: true },
                  { name: 'Listed', value: auction_count.toString(), inline: true },
                  { name: 'Volume', value: volume.toString(), inline: true },
                  { name: '24hr Volume', value: volume_24hr.toString(), inline: true },
                  { name: 'Sales 24hr', value: num_sales_24hr.toString(), inline: true }
              );
          
          const twitterButton = new ButtonBuilder()
          .setLabel('Go To Twitter')
          .setStyle(ButtonStyle.Link) 
          .setURL('https://twitter.com/SEI_Boys');
          
          const collectionButton = new ButtonBuilder()
          .setLabel('Go To Collection')
          .setStyle(ButtonStyle.Link) 
          .setURL('https://pallet.exchange/collection/sei-boys'); 
  
          const row = new ActionRowBuilder().addComponents(twitterButton, collectionButton);

          await interaction.editReply({ embeds: [embed], components: [row] });
      } catch (error) {
          console.error(`An error occurred: ${error.message}`);
          await interaction.editReply({ content: 'Failed to retrieve collection information. Please try again later.' });
      }
  }


  });

  async function queryCollectionInfo() {
    const { default: fetch } = await import('node-fetch');
    const url = `https://api.pallet.exchange/api/v2/nfts/sei18dzktltwccme3vrzc9y624jjm9q5ghzjww7zz38p07qzqys2xgzsvr5dx3/details`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch collection info: ${response.statusText}`);
        }
        const data = await response.json();
        return data; 
    } catch (error) {
        console.error('There was an error fetching the collection info:', error);
        throw error; 
    }
}


async function queryNFTMetadata(contractAddress, tokenId) {
  const client = await CosmWasmClient.connect(rpcEndpoint);
  const query = { nft_info: { token_id: tokenId } };
  const response = await client.queryContractSmart(contractAddress, query);
  return response;
}  

async function queryTokenOwners(contractAddress, startTokenId, endTokenId, batchSize, collectionName, filename) {
  const client = await CosmWasmClient.connect(rpcEndpoint);
  let owners = listAllHolders ? [] : new Set();

  for (let tokenId = startTokenId; tokenId <= endTokenId; tokenId += batchSize) {
    const promises = [];
    for (let id = tokenId; id < tokenId + batchSize && id <= endTokenId; id++) {
      console.log(`Preparing query for token ID ${id}`);
      promises.push(
        client.queryContractSmart(contractAddress, { owner_of: { token_id: id.toString() } })
          .then(result => {
            if (result.owner && result.owner !== excludeAddress) {
              if (listOnlyAddresses) {
                if (listAllHolders) {
                  owners.push(result.owner); 
                } else {
                  owners.add(result.owner); 
                }
              } else {
                owners[result.owner] = owners[result.owner] || [];
                owners[result.owner].push(id);
              }
            }
          })
          .catch(error => {
            console.error(`Error querying token ID ${id}:`, error.message);
          })
      );
    }

    await Promise.allSettled(promises);
    console.log(`Finished querying batch up to token ID ${tokenId + batchSize - 1}`);
  }

  let filePrefix = collectionName;
  if (listOnlyAddresses) {
    filePrefix += '_Unique_Addresses';
  }
  if (listAllHolders) {
    filePrefix += '_All_Addresses';
  }

  const fileName = `${filePrefix}.txt`;

  if (listOnlyAddresses) {
    fs.writeFileSync(fileName, JSON.stringify(listAllHolders ? owners : [...owners], null, 2));
  } else {
    fs.writeFileSync(fileName, JSON.stringify(owners, null, 2));
  }
  
  return { content: 'Here are the queried owners, unique addresses only:', files: [fileName] }
}


async function queryTokenOwnersAmount(contractAddress, startTokenId, endTokenId, batchSize, collectionName, filename) {
  const client = await CosmWasmClient.connect(rpcEndpoint);
  let ownersMap = {}; // Use an object to map addresses to token counts

  for (let tokenId = startTokenId; tokenId <= endTokenId; tokenId += batchSize) {
    const promises = [];
    for (let id = tokenId; id < tokenId + batchSize && id <= endTokenId; id++) {
      // console.log(`Preparing query for token ID ${id}`);
      promises.push(
        client.queryContractSmart(contractAddress, { owner_of: { token_id: id.toString() } })
          .then(result => {
            if (result.owner && result.owner !== excludeAddress) {
              const normalizedOwner = result.owner.toLowerCase();
              ownersMap[normalizedOwner] = (ownersMap[normalizedOwner] || 0) + 1; 
            }
          })
          .catch(error => {
            console.error(`Error querying token ID ${id}:`, error.message);
          })
      );
    }

    await Promise.allSettled(promises);
    console.log(`Finished querying batch up to token ID ${tokenId + batchSize - 1}`);
  }

  const ownersArray = Object.entries(ownersMap).map(([owner_address, tokens_owned]) => ({
    owner_address,
    tokens_owned
  }));

  //array to CSV 
  const csvHeader = "owner_address,tokens_owned\n";
  const csvContent = ownersArray.map(obj => `${obj.owner_address},${obj.tokens_owned}`).join('\n');
  const csvData = csvHeader + csvContent;

 
  const csvFileName = `${collectionName}_Owners_Tokens_Count.csv`;
  fs.writeFileSync(csvFileName, csvData);
  
  return { content: 'CSV file created with the queried owners and the number of tokens owned:', files: [csvFileName] };
}

client.login(token);