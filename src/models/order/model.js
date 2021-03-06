const mongoose = require('mongoose')
const OrderSchema = require('./schema')
const Product = require('../product/index.js')
const ProductVariants = require('../product/variant/index.js')
const { tenantModel } = require('../../utils/multitenancy')
const AutoIncrement = require('mongoose-sequence')(mongoose)

OrderSchema.plugin(AutoIncrement, {
  inc_field: 'id',
  start_seq: 100
})

async function updateProductStock ({ productId, variantId, trackInventory, currentStock, qty }, direction) {
  const newStock = direction === 'decrease' ? currentStock - qty : currentStock + qty
  let update

  if (trackInventory === 'variant-inventory') {
    update = await ProductVariants.updateOne({ _id: variantId }, {
      stock: newStock
    })
  } else if (trackInventory === 'product-inventory') {
    update = await Product.updateOne({ _id: productId }, {
      stock: newStock
    })
  }

  return update
}

async function stockLevelHandler (product) {
  // Does product have options
  const variantId = product.variant_id
  const productId = product.product_id
  const trackInventory = product.track_inventory
  let stock

  if (trackInventory === 'variant-inventory') {
    const productVariant = await ProductVariants.findOne({ _id: variantId })
    stock = productVariant.stock
  } else if (trackInventory === 'product-inventory') {
    const prod = await Product.findOne({ _id: productId })
    stock = prod.stock
  }

  return stock
}

// Check stock before creating order
OrderSchema.pre('save', async function (next) {
  const order = this
  const orderProducts = order.products

  const promise = await orderProducts.map(async orderProduct => {
    const productId = orderProduct.product_id
    const productName = orderProduct.name
    const trackInventory = orderProduct.track_inventory
    const variantId = orderProduct.variant_id
    const orderQty = orderProduct.quantity

    if (trackInventory === 'none') {
      return next()
    }

    const stockLevel = await stockLevelHandler(orderProduct)

    if (orderQty > stockLevel) {
      throw new Error(`Product '${productName}' is out of stock`)
    }

    // There is enough stock, so decrease stock
    updateProductStock({
      currentStock: stockLevel,
      qty: orderQty,
      trackInventory,
      variantId,
      productId
    }, 'decrease')
    next()
  })

  await Promise.all(promise)
})

// Get orders by customer id
OrderSchema.statics.findOrdersByCustomerId = async ({ page, limit, customerId }) => {
  const order = Order()
  const orders = await order
    .find({
      customer_id: customerId
    })
    .sort('-date_created')
    .skip((page - 1) * limit)
    .limit(limit)

  console.log('orders', orders)

  const total = await order.countDocuments()
  return {
    data: orders,
    meta: {
      pagination: {
        current: page,
        total: orders.length
      },
      results: {
        total
      }
    }
  }
}

// Update order
OrderSchema.statics.updateOrder = async (orderId, orderDetails) => {
  const order = Order()
  const orderProducts = orderDetails.products

  if (orderProducts) {
    const promise = await orderProducts.map(async orderProduct => {
      const storedOrder = await order.findOne({ id: orderId })
      const storedOrderProduct = storedOrder.products.find((order) => {
        return order._id.toString() === orderProduct._id
      })
      const storedOrderProductQty = storedOrderProduct ? storedOrderProduct.quantity : 0
      const orderQty = orderProduct.quantity
      const productName = orderProduct.name
      const productId = orderProduct.product_id
      const variantId = orderProduct.variant_id
      const stockLevel = await stockLevelHandler(orderProduct)

      // Quantity can not be 0 {
      if (orderQty === '' || orderQty === 0) {
        throw new Error(`Product \`${productName}\` quantity needs to be a valid amount`)
      }

      // Client has decreased order quantity, so increase stock level
      if (orderQty < storedOrderProductQty) {
        const stockToAdd = storedOrderProductQty - orderQty
        updateProductStock({
          currentStock: stockLevel,
          qty: stockToAdd,
          variantId,
          productId
        }, 'increase')
      } else if (orderQty > storedOrderProductQty) {
        const stockToRemove = orderQty - storedOrderProductQty
        if (stockToRemove > stockLevel) {
          throw new Error(`Product \`${productName}\` is out of stock`)
        }
        updateProductStock({
          currentStock: stockLevel,
          qty: stockToRemove,
          variantId,
          productId
        }, 'decrease')
      }
    })

    await Promise.all(promise)
  }
  const orderResponse = await order.updateOne({ id: orderId }, orderDetails)
  return orderResponse
}

// Delete order
OrderSchema.statics.deleteOrder = async (orderId) => {
  const order = await Order().deleteOne({ id: orderId })
  return order
}

const Order = function () {
  return tenantModel('Order', OrderSchema)
}
module.exports = Order
