import { log } from './logger.js';

// Update product in database with new data - enhanced for consistent history tracking
export const updateProductInDatabase = async (productId, productData, isCompetitor = false, competitorIndex = null, ProductModel) => {
  try {
    // Add debug logging to see the update operation
    console.log(`💾 DB UPDATE: Saving data for product ID ${productId}`, 
      isCompetitor ? `(as competitor at index ${competitorIndex})` : '(as main product)');
    console.log(`💾 DB DATA: ${JSON.stringify({
      name: productData.name,
      currentPrice: productData.currentPrice,
      quantity: productData.quantity || 0,
      availability: productData.availability
    })}`);

    // Validation to make sure ProductModel is defined
    if (!ProductModel) {
      const errorMsg = 'Product model is undefined - cannot perform database operation';
      log(errorMsg, 'error');
      console.error(`❌ DATABASE ERROR: ${errorMsg}`);
      return false;
    }

    if (!productId) {
      log('Cannot update product: productId is missing', 'error');
      return false;
    }

    // Important: First fetch the document to see what field names it uses
    const existingDoc = await ProductModel.findOne({_id: productId});
    if (!existingDoc) {
      log(`Product with ID ${productId} not found in database`, 'error');
      return false;
    }
    
    console.log(`💾 EXISTING DOC FIELDS: ${Object.keys(existingDoc._doc).join(', ')}`);
    
    // Get current timestamp for all history entries
    const currentDate = new Date();
    
    if (isCompetitor && competitorIndex !== null) {
      // Handle competitor update with consistent history tracking
      const competitor = existingDoc.competitors && existingDoc.competitors[competitorIndex];
      if (!competitor) {
        log(`Competitor at index ${competitorIndex} not found for product ${productId}`, 'error');
        return false;
      }

      // Create the update object for competitor base data
      const updatePath = `competitors.${competitorIndex}`;
      const updateData = {};
      
      // Only update fields that exist in productData and are not null/undefined
      if (productData.name) updateData[`${updatePath}.name`] = productData.name;
      if (productData.currentPrice !== undefined) updateData[`${updatePath}.currentPrice`] = productData.currentPrice;
      if (productData.quantity !== undefined) updateData[`${updatePath}.quantity`] = productData.quantity;
      if (productData.originalPhotoUrl) updateData[`${updatePath}.originalPhotoUrl`] = productData.originalPhotoUrl;
      if (productData.description) updateData[`${updatePath}.description`] = productData.description;
      if (productData.brand) updateData[`${updatePath}.brand`] = productData.brand;
      
      // Update last checked timestamp
      updateData[`${updatePath}.lastChecked`] = currentDate;
      
      // Perform the base update if there are fields to update
      if (Object.keys(updateData).length > 0) {
        console.log(`💾 Updating competitor base data: ${JSON.stringify(updateData)}`);
        await ProductModel.updateOne(
          { _id: productId },
          { $set: updateData }
        );
      }
      
      // ALWAYS add history entries regardless of value changes
      
      // Add price history entry if price data exists
      if (productData.currentPrice !== undefined) {
        const priceHistoryEntry = {
          price: productData.currentPrice,
          date: currentDate
        };
        
        console.log(`💾 Adding price history entry for competitor: ${JSON.stringify(priceHistoryEntry)}`);
        
        await ProductModel.updateOne(
          { _id: productId },
          { $push: { [`${updatePath}.priceHistory`]: priceHistoryEntry } }
        );
      }
      
      // Add availability history entry if quantity data exists
      if (productData.quantity !== undefined) {
        const availabilityHistoryEntry = {
          quantity: productData.quantity,
          date: currentDate
        };
        
        console.log(`💾 Adding availability history entry for competitor: ${JSON.stringify(availabilityHistoryEntry)}`);
        
        await ProductModel.updateOne(
          { _id: productId },
          { $push: { [`${updatePath}.availabilityHistory`]: availabilityHistoryEntry } }
        );
      }
      
      log(`Updated competitor at index ${competitorIndex} for product ${productId} with history entries`, 'info');
    } else {
      // Handle main product update with consistent history tracking
      
      // Update main product basic data
      const updateData = {};
      
      // Only update fields that exist in productData and are not null/undefined
      if (productData.name) updateData.name = productData.name;
      if (productData.currentPrice !== undefined) updateData.currentPrice = productData.currentPrice;
      if (productData.quantity !== undefined) updateData.quantity = productData.quantity;
      if (productData.originalPhotoUrl) updateData.originalPhotoUrl = productData.originalPhotoUrl;
      if (productData.description) updateData.description = productData.description;
      if (productData.brand) updateData.brand = productData.brand;
      
      // Update last checked timestamp
      updateData.lastChecked = currentDate;
      
      // Perform base update if there are fields to update
      if (Object.keys(updateData).length > 0) {
        console.log(`💾 Updating main product base data: ${JSON.stringify(updateData)}`);
        await ProductModel.updateOne(
          { _id: productId },
          { $set: updateData }
        );
      }
      
      // ALWAYS add history entries regardless of value changes
      
      // Add price history entry if price data exists
      if (productData.currentPrice !== undefined) {
        const priceHistoryEntry = {
          price: productData.currentPrice,
          date: currentDate
        };
        
        console.log(`💾 Adding price history entry for main product: ${JSON.stringify(priceHistoryEntry)}`);
        
        await ProductModel.updateOne(
          { _id: productId },
          { $push: { priceHistory: priceHistoryEntry } }
        );
      }
      
      // Add availability history entry if quantity data exists
      if (productData.quantity !== undefined) {
        const availabilityHistoryEntry = {
          quantity: productData.quantity,
          date: currentDate
        };
        
        console.log(`💾 Adding availability history entry for main product: ${JSON.stringify(availabilityHistoryEntry)}`);
        
        await ProductModel.updateOne(
          { _id: productId },
          { $push: { availabilityHistory: availabilityHistoryEntry } }
        );
      }
      
      log(`Updated main product ${productId} with history entries`, 'info');
    }
    
    // Verify the update by retrieving the document again
    const updatedDoc = await ProductModel.findById(productId);
    
    if (!updatedDoc) {
      log(`Failed to verify update for product ${productId}`, 'error');
      return false;
    }
    
    // Log actual stored values for debugging
    if (isCompetitor && competitorIndex !== null) {
      const competitor = updatedDoc.competitors && updatedDoc.competitors[competitorIndex];
      console.log(`✅ ACTUAL VALUES STORED IN DB (competitor): ${JSON.stringify({
        name: competitor?.name,
        currentPrice: competitor?.currentPrice,
        quantity: competitor?.quantity,
        lastChecked: competitor?.lastChecked,
        priceHistory: competitor?.priceHistory?.length || 0,
        availabilityHistory: competitor?.availabilityHistory?.length || 0
      })}`);
    } else {
      console.log(`✅ ACTUAL VALUES STORED IN DB (main product): ${JSON.stringify({
        name: updatedDoc.name,
        currentPrice: updatedDoc.currentPrice,
        quantity: updatedDoc.quantity,
        lastChecked: updatedDoc.lastChecked,
        priceHistory: updatedDoc.priceHistory?.length || 0,
        availabilityHistory: updatedDoc.availabilityHistory?.length || 0
      })}`);
    }
    
    console.log(`✅ DATABASE UPDATE SUCCESSFUL: Product ${productId} updated with history entries`);
    
    return true;
  } catch (error) {
    console.error(`❌ DATABASE ERROR:`, error);
    log(`Error updating product in database: ${error.message}`, 'error');
    return false;
  }
};

export default {
  updateProductInDatabase
};
