const express = require('express')
const router = express.Router()
const { auth } = require('../middleware/auth')
const {
  getCategories,
  getCategory
} = require('../controller/categories')

// Get categories
router.get('/:storeHash/categories', auth, (req, res) => getCategories(req, res))
// Get category
router.get('/:storeHash/categories/:categoryId', auth, (req, res) => getCategory(req, res))

module.exports = router
