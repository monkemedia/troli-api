const cls = require('cls-hooked')
const { Mongoose } = require('mongoose')
const multitenantPool = {}

const getTenantDB = function getConnections (storeHash, modelName, schema) {
  // Check connections lookup
  const mCon = multitenantPool[storeHash]
  if (mCon) {
    if (!mCon.modelSchemas[modelName]) {
      mCon.model(modelName, schema)
    }
    return mCon
  }

  const mongoose = new Mongoose()
  const url = process.env.MONGODB_BASE_URL + '/' + storeHash
  const options = {
    useNewUrlParser: true,
    useCreateIndex: true,
    useUnifiedTopology: true
  }
  mongoose.connect(url, options)
  multitenantPool[storeHash] = mongoose
  mongoose.model(modelName, schema)
  mongoose.connection.on('error', err => console.log(err))
  mongoose.connection.once('open', () => console.log(`mongodb connected to ${url}`))
  return mongoose
}

exports.tenantModel = (modelName, schema, hash) => {
  const session = cls.getNamespace('session')
  const storeHash = hash || session.get('store_hash')
  const tenantDb = getTenantDB(storeHash, modelName, schema)
  return tenantDb.model(modelName)
}
