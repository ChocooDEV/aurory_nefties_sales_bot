// Import
const { TwitterApi } = require("twitter-api-v2");
const axios = require("axios");
const sharp = require('sharp');

// Express in order to host the app on a platform like Vercel, Heroku...
const express = require('express')
const app = express()
const port = process.env.PORT || 4000;

app.listen(port, () => {
    console.log(`Listening on port ${port}`)
  })
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

// Function to resize the image using sharp
const resizeImage = async (buffer) => {
    const resizedBuffer = await sharp(buffer)
        .resize({ width: 1024, height: 1024, fit: sharp.fit.inside, withoutEnlargement: true })
        .toBuffer();
    return resizedBuffer;
};

// Tweet function which post tweet with media and text
const mediaTweet = async (text, imageUrl) => {
    try {
        // Download the image from the URL into a buffer
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        let buffer = Buffer.from(response.data, 'binary');
        buffer = await resizeImage(buffer)

        // Create mediaID 
        const mediaId = await client.v1.uploadMedia(buffer, { mimeType: 'image/png' });
        console.log("media ["+mediaId+"] has been uploaded")

        // Use tweet() method and pass object with text and image
        await rwClient.v2.tweet({
            text: text,
            media: { media_ids: [mediaId] },
        });
        console.log("Tweet success");
    } catch (error) {
        console.error('Error in mediaTweet:', error);
        if (error.data) {
            console.error('Error data:', error.data);
        }
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
                        const rarity = itemDetails.generated_attributes.rarity;
                        const price = sale.unit_price / 1e9;
                        let text;

                         // Tweet depending on the rarity
                        if (rarity === 'Rare') {
                            text = `🌟 Someone just bought a Rare ${itemDetails.name}!🌟`;
                        } else if (rarity === 'Epic') {
                            text = `🔥 Someone just bought an Epic ${itemDetails.name}! 🔥`;
                        } else if (rarity === 'Legendary') {
                            text = `🌌 Someone just acquired a 𝗟𝗘𝗚𝗘𝗡𝗗𝗔𝗥𝗬 ${itemDetails.name}! 🌌`;
                        }

                        // I'd consider to avoid displaying the price if it's under 50 $AURY because some players transfer assets using bids
                        // which isn't very sexy to see the prices in those cases
                        if (price >= 50) {
                            text += `\n\nAcquired for ${price} $AURY💰`;
                        }

                        text += `\n\nStart playing Aurory right now at https://www.app.aurory.io`;

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