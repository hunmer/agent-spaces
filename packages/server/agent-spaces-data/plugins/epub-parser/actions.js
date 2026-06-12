let _epubParser
async function getEpubParser() {
  if (!_epubParser) _epubParser = await import('@lingo-reader/epub-parser')
  return _epubParser
}

module.exports = (t) => [
  {
    name: 'epub_info',
    label: t('action.epub_info.label', 'EPUB Book Info'),
    category: t('category', 'EPUB Parser'),
    icon: 'BookOpen',
    description: t('action.epub_info.description', 'Parse an EPUB file to extract book metadata (title, author, language, publisher, etc.) and table of contents'),
    properties: [
      { key: 'filePath', label: t('field.filePath.label', 'EPUB File Path'), type: 'text', required: true, tooltip: t('field.filePath.tooltip', 'Absolute path to the EPUB file') },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'fileInfo', type: 'object', children: [] },
        { key: 'metadata', type: 'object', children: [] },
        { key: 'toc', type: 'object', children: [] },
        { key: 'spineCount', type: 'number' },
        { key: 'guide', type: 'object', children: [] },
      ] },
    ],
    run: async (ctx, args) => {
      const { filePath } = args
      if (!filePath) return { success: false, message: t('message.filePathRequired', 'filePath is required') }

      ctx.logger.info(`解析EPUB文件: ${filePath}`)
      const { initEpubFile } = await getEpubParser()
      const epub = await initEpubFile(filePath)

      try {
        const fileInfo = epub.getFileInfo()
        const metadata = epub.getMetadata()
        const toc = epub.getToc()
        const spine = epub.getSpine()
        const guide = epub.getGuide()

        const result = {
          fileInfo,
          metadata: {
            title: metadata.title,
            language: metadata.language,
            description: metadata.description,
            publisher: metadata.publisher,
            rights: metadata.rights,
            date: metadata.date,
            creator: metadata.creator?.map(c => c.contributor),
            subject: metadata.subject?.map(s => s.subject),
          },
          toc: toc.map(item => ({
            label: item.label,
            href: item.href,
            id: item.id,
            playOrder: item.playOrder,
            children: item.children,
          })),
          spineCount: spine.length,
          spine: spine.map(item => ({
            id: item.id,
            href: item.href,
            linear: item.linear,
          })),
          guide,
        }

        ctx.logger.info(`解析完成: "${result.metadata.title}", 共 ${result.spineCount} 章`)
        return { success: true, message: t('message.parseComplete', 'Parse completed: {title}').replace('{title}', result.metadata.title), data: result }
      } finally {
        epub.destroy()
      }
    },
  },
  {
    name: 'epub_chapters',
    label: t('action.epub_chapters.label', 'EPUB Chapter Content'),
    category: t('category', 'EPUB Parser'),
    icon: 'FileText',
    description: t('action.epub_chapters.description', 'Parse an EPUB file and return chapter content (HTML text and CSS) for a specified range'),
    properties: [
      { key: 'filePath', label: t('field.filePath.label', 'EPUB File Path'), type: 'text', required: true, tooltip: t('field.filePath.tooltip', 'Absolute path to the EPUB file') },
      { key: 'start', label: t('field.start.label', 'Start Chapter'), type: 'number', default: 0, tooltip: t('field.start.tooltip', 'Chapter index starting from 0') },
      { key: 'count', label: t('field.count.label', 'Chapter Count'), type: 'number', default: 1, tooltip: t('field.count.tooltip', 'Number of chapters to load, 0 for all') },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'total', type: 'number' },
        { key: 'chapters', type: 'object', children: [] },
      ] },
    ],
    run: async (ctx, args) => {
      const { filePath, start = 0, count = 1 } = args
      if (!filePath) return { success: false, message: t('message.filePathRequired', 'filePath is required') }

      ctx.logger.info(`加载章节: ${filePath}, start=${start}, count=${count}`)
      const { initEpubFile } = await getEpubParser()
      const epub = await initEpubFile(filePath)

      try {
        const spine = epub.getSpine()
        const total = spine.length

        const from = Math.max(0, start)
        const to = count === 0 ? total : Math.min(from + count, total)

        const chapters = []
        for (let i = from; i < to; i++) {
          const item = spine[i]
          ctx.logger.info(`加载第 ${i} 章: ${item.id}`)
          const chapter = await epub.loadChapter(item.id)
          chapters.push({
            index: i,
            id: item.id,
            href: item.href,
            linear: item.linear,
            html: chapter?.html || '',
            css: chapter?.css || [],
          })
        }

        ctx.logger.info(`加载完成: ${chapters.length}/${total} 章`)
        return {
          success: true,
          message: t('message.chaptersLoaded', 'Loaded {loaded} of {total} chapters').replace('{loaded}', chapters.length).replace('{total}', total),
          data: { total, chapters },
        }
      } finally {
        epub.destroy()
      }
    },
  },
]
