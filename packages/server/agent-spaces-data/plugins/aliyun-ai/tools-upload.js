const { getHeaders } = require('./shared')

const UPLOAD_POLICY_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/uploads'

module.exports = {
  tools: [
    {
      name: 'aliyun_upload_file',
      description: '上传本地文件到阿里云百炼临时存储空间，获取 oss:// 临时URL（有效期48小时）。用于将本地图片/视频/音频上传后供其他AI模型工具使用。文件上传时需指定目标模型名，且该模型须与后续调用的模型一致。',
      input_schema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', description: '阿里云百炼 DashScope API Key' },
          filePath: { type: 'string', description: '本地文件路径' },
          model: { type: 'string', description: '目标模型名（文件与模型绑定，须与后续调用一致），如 qwen-vl-plus、wan2.7-i2v 等' },
        },
        required: ['apiKey', 'filePath', 'model'],
      },
    },
  ],

  handler: async (name, args, api) => {
    if (name !== 'aliyun_upload_file') {
      return { success: false, message: `未知工具: ${name}` }
    }

    const { apiKey, filePath, model } = args
    if (!apiKey || !filePath || !model) {
      return { success: false, message: '缺少必要参数: apiKey, filePath, model' }
    }

    // 1. 获取上传凭证
    const policyHeaders = getHeaders(args)
    const policyUrl = `${UPLOAD_POLICY_ENDPOINT}?action=getPolicy&model=${encodeURIComponent(model)}`
    const policyResult = await api.getJson(policyUrl, { headers: policyHeaders, timeout: 30000 })

    if (!policyResult.data) {
      return { success: false, message: `获取上传凭证失败: ${policyResult.message || JSON.stringify(policyResult)}` }
    }

    const policy = policyResult.data
    const fileName = filePath.split(/[/\\]/).pop()
    const key = `${policy.upload_dir}/${fileName}`

    // 2. 上传文件到 OSS
    const uploaded = await api.uploadFile(policy.upload_host, {
      fields: {
        OSSAccessKeyId: policy.oss_access_key_id,
        Signature: policy.signature,
        policy: policy.policy,
        'x-oss-object-acl': policy.x_oss_object_acl,
        'x-oss-forbid-overwrite': policy.x_oss_forbid_overwrite,
        key,
        success_action_status: '200',
      },
      filePath,
    })

    if (!uploaded) {
      return { success: false, message: '文件上传失败' }
    }

    // 3. 拼接临时 URL
    const ossUrl = `oss://${key}`
    const maxSizeInfo = policy.max_file_size_mb ? `，文件大小限制 ${policy.max_file_size_mb}MB` : ''

    return {
      success: true,
      message: `文件上传成功，临时URL有效期48小时${maxSizeInfo}`,
      data: {
        url: ossUrl,
        fileName,
        key,
        model,
        expireInSeconds: policy.expire_in_seconds,
      },
    }
  },
}
