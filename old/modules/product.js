import mongoose from 'mongoose';
const Schema = mongoose.Schema;

// Общая схема для мониторинга цен
const PriceMonitoringSchema = new Schema({
  currentPrice: { type: Number, required: false },
  priceHistory: [{
    price: { type: Number, required: false },
    date: { type: Date, default: Date.now }
  }]
}, { _id: false });

// Общая схема для мониторинга наличия
const AvailabilityMonitoringSchema = new Schema({
  // null - количество неизвестно, 0 - точно нет в наличии, >0 - есть в наличии
  quantity: { type: Number, default: null },
  availabilityHistory: [{
    quantity: { type: Number, required: false },
    date: { type: Date, default: Date.now }
  }]
}, { _id: false });

// Общая схема для базовых свойств товара/конкурента
const ItemBaseSchema = new Schema({
  name: { type: String, required: false },
  url: { type: String, required: true },
  photoUrl: { type: String },
  addedAt: { type: Date, default: Date.now },
  enabled: { type: Boolean, default: true },
  tags: [{ type: String }]
}, { _id: false });

// Основная схема товара
const ProductSchema = new Schema({
  // Базовая информация о товаре
  ...ItemBaseSchema.obj,
  
  // Дополнительные поля специфичные для нашего товара
  category: { type: String, required: false },
  originalPhotoUrl: { type: String },
  
  // Мониторинг цены и наличия
  ...PriceMonitoringSchema.obj,
  ...AvailabilityMonitoringSchema.obj,
  
  // Информация по конкурентам
  competitors: [{
    // Базовая информация о конкуренте
    ...ItemBaseSchema.obj,
    
    // Мониторинг цены и наличия у конкурента
    ...PriceMonitoringSchema.obj,
    ...AvailabilityMonitoringSchema.obj
  }]
}, { timestamps: true });

// Use mongoose.models to prevent recompilation errors in Next.js
export default mongoose.models.Product || mongoose.model('Product', ProductSchema);