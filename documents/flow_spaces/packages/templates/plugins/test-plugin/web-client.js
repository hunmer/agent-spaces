export async function activate(context) {
  context.logger.info('web test plugin activated')
  await context.storage.set('activatedAt', Date.now())
}

export async function deactivate(context) {
  context.logger.info('web test plugin deactivated')
}
