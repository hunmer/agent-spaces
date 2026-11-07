const OSS = require('ali-oss')

/**
 * 根据参数或插件配置创建 OSS 客户端
 * 单个参数优先级高于插件全局配置
 */
function createClient(args) {
  const options = {
    accessKeyId: args.accessKeyId,
    accessKeySecret: args.accessKeySecret,
    bucket: args.bucket,
    secure: args.secure !== false,
    authorizationV4: true,
  }

  if (args.endpoint) {
    options.endpoint = args.endpoint
  } else if (args.region) {
    options.region = args.region
  }

  if (!options.accessKeyId || !options.accessKeySecret) {
    throw new Error('缺少 accessKeyId 或 accessKeySecret')
  }
  if (!options.bucket) {
    throw new Error('缺少 bucket')
  }
  if (!options.endpoint && !options.region) {
    throw new Error('缺少 region 或 endpoint')
  }

  return new OSS(options)
}

/**
 * 将 OSS result 标准化为插件输出格式
 */
function normalizeResult(ossResult) {
  return {
    name: ossResult.name || '',
    url: ossResult.url || '',
    res: {
      status: ossResult.res?.status,
      headers: ossResult.res?.headers,
    },
  }
}

module.exports = { createClient, normalizeResult }
