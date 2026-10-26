const yaml = require('js-yaml')

function hasPublisher(configuration) {
  try {
    const parsed = yaml.load(configuration)
    if (!parsed || typeof parsed !== 'object') return false
    const names = Array.isArray(parsed.publisherName) ? parsed.publisherName : [parsed.publisherName]
    return names.length > 0 && names.every((name) => typeof name === 'string' && name.trim().length > 0)
  } catch { return false }
}

module.exports = { hasPublisher }
