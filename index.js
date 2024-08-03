// Import
const { TwitterApi } = require("twitter-api-v2");
const axios = require("axios");

// Load env var
require('dotenv').config();

// Twitter-api-v2 setup
const client = new TwitterApi({
    appKey: process.env.API_Key,
    appSecret: process.env.API_Secret,
    accessToken: process.env.Access_Token,
    accessSecret: process.env.Access_Token_Secret,
    bearerToken:process.env.Bearer_Token
});

// Read and write controls
const rwClient = client.readWrite;

// Tweet function which post tweet with media and text
const mediaTweet = async (text, image) => {
    try {

        // Create mediaID 
        const mediaId = await client.v1.uploadMedia(image);

        // Use tweet() method and pass object with text and image
        await rwClient.v2.tweet({
            text: text,
            media: { media_ids: [mediaId] },
        });
        console.log("Tweet success");
    } catch (error) {
        console.log(error);
    }
};


async function main(){
    // Store processed items. Basically it's the 10 latest sales returned by the 1st endpoint
    const processedItemIds = new Set();

    while(true){
        try {
            // Fetch recent sales
            const salesResponse = await axios.get('https://marketplace-v2-public-api.live.aurory.io/v1/sales?source=LISTING&item_collection_types=NEFTIE&unit_price_gte=1&order_by=createdAt%2CDESC');
            const salesData = salesResponse.data.data;

            // Iterate through each sale
            for (const sale of salesData) {
                const itemId = sale.item_id;

                if(sale.type === 'LISTING_SOLD_COMPLETELY'){
                    // Skip this item if it has already been processed
                    if (processedItemIds.has(itemId)) {
                        continue;
                    }

                    // If the set already has 10 items, remove the first one (FIFO)
                    if (processedItemIds.size >= 10) {
                        // Convert set to array to get the first element
                        const firstItemId = processedItemIds.values().next().value;
                        processedItemIds.delete(firstItemId);
                    }

                    // Mark as "treated" and add to set
                    processedItemIds.add(itemId);

                    // Fetch item details using the item_id
                    const itemResponse = await axios.get(`https://items-public-api.live.aurory.io/v1/items/${itemId}`);
                    const itemDetails = itemResponse.data;
    
                    // Check the rarity of the item
                    if (itemDetails.generated_attributes.rarity === 'Rare' || itemDetails.generated_attributes.rarity === 'Epic' || itemDetails.generated_attributes.rarity === 'Legendary' ) {
                        // Tweet if the item is rare
                        const text = `A ${itemDetails.generated_attributes.rarity} ${itemDetails.name} has been sold! `;
                        const image = itemDetails.image_mini;
                        await mediaTweet(text, image);
                    }
                }
            }

            // Wait for a certain period before polling again
            await new Promise(resolve => setTimeout(resolve, 300000)); // 300000 ms = 5 minutes
        } catch (error) {
            console.log('Error during polling: ', error);
        }
    }       
}

main();

///////////////////////////////////