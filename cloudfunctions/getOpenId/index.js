const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async () => {
  const context = cloud.getWXContext()

  return {
    openid: context.OPENID
  }
}
