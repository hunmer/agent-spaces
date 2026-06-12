const COS = require('cos-nodejs-sdk-v5')

/**
 * 根据参数或插件配置创建 COS 客户端
 */
function createClient(args) {
  if (!args.secretId || !args.secretKey) {
    throw new Error('缺少 secretId 或 secretKey')
  }
  return new COS({
    SecretId: args.secretId,
    SecretKey: args.secretKey,
  })
}

/** 提取公共 Bucket / Region 参数 */
function getBucketParams(args) {
  if (!args.bucket) throw new Error('缺少 bucket')
  if (!args.region) throw new Error('缺少 region')
  return { Bucket: args.bucket, Region: args.region }
}

/**
 * 拼接公开读文件的直链
 * 格式: https://<bucket>.cos.<region>.myqcloud.com/<key>
 */
function getPublicUrl(args, key) {
  const bucket = encodeURIComponent(args.bucket)
  const region = encodeURIComponent(args.region)
  const encodedKey = key.split('/').map(s => encodeURIComponent(s)).join('/')
  return `https://${bucket}.cos.${region}.myqcloud.com/${encodedKey}`
}

module.exports = { createClient, getBucketParams, getPublicUrl }
