const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event) => {
  const context = cloud.getWXContext()

  try {
    const isAdmin = await checkAdmin(context.OPENID)

    if (!isAdmin) {
      return {
        success: false,
        message: '无管理员权限'
      }
    }

    const tableId = normalizeText(event.tableId, 100)
    const tableNo = normalizeText(event.tableNo, 30).toUpperCase()

    if (!tableId || !tableNo) {
      throw new Error('缺少餐桌信息')
    }

    const tableResult = await db.collection('tables').doc(tableId).get()
    const table = tableResult.data

    if (!table || table.tableNo !== tableNo) {
      throw new Error('餐桌不存在或桌号不匹配')
    }

    const scene = `tableNo=${tableNo}`

    if (Buffer.byteLength(scene, 'utf8') > 32) {
      throw new Error('桌号过长，无法生成点餐码')
    }

    const codeResult = await cloud.openapi.wxacode.getUnlimited({
      scene,
      page: 'pages/menu/menu',
      checkPath: false,
      envVersion: 'release',
      width: 430
    })
    const cloudPath = `table-codes/${safeFileName(tableNo)}-${Date.now()}.png`
    const uploadResult = await cloud.uploadFile({
      cloudPath,
      fileContent: codeResult.buffer
    })

    await db.collection('tables').doc(tableId).update({
      data: {
        codeFileID: uploadResult.fileID,
        codeUpdatedAt: db.serverDate()
      }
    })

    return {
      success: true,
      fileID: uploadResult.fileID
    }
  } catch (error) {
    console.error('generateTableCode 失败：', error)

    return {
      success: false,
      message: error.message || '生成点餐码失败'
    }
  }
}

async function checkAdmin(openid) {
  const result = await db
    .collection('adminUsers')
    .where({
      openid,
      role: 'admin'
    })
    .limit(1)
    .get()

  return result.data.length > 0
}

function normalizeText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function safeFileName(value) {
  return value.replace(/[^A-Z0-9_-]/g, '_')
}
