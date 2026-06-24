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
 * 规范化上传返回的 Location 字段
 * COS SDK 返回的 Location 不带协议头（如 bucket.cos.region.myqcloud.com/key），
 * 这里统一补上 https://
 */
function normalizeLocation(location) {
  if (!location) return location
  if (location.startsWith('http://') || location.startsWith('https://')) return location
  return `https://${location}`
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

module.exports = { createClient, getBucketParams, getPublicUrl, normalizeLocation }
