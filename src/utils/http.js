const crypto = require('crypto');

function weakEtag(parts) {
  const h = crypto.createHash('sha1').update(parts.join('|')).digest('hex');
  return `W/"${h}"`;
}

function applyConditionalGet(req, res, etag, lastModified) {
  if (etag) res.setHeader('ETag', etag);
  if (lastModified) res.setHeader('Last-Modified', new Date(lastModified).toUTCString());

  const inm = req.headers['if-none-match'];
  if (inm && etag && inm === etag) {
    res.status(304).end();
    return true;
  }
  const ims = req.headers['if-modified-since'];
  if (ims && lastModified) {
    const since = Date.parse(ims);
    const mod = Date.parse(lastModified);
    if (!Number.isNaN(since) && !Number.isNaN(mod) && mod <= since) {
      res.status(304).end();
      return true;
    }
  }
  return false;
}

function paginationLinks(req, offset, limit, count) {
  const base = `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`;
  const q = new URLSearchParams(req.query);
  const links = {};
  if (offset + limit < count) {
    q.set('offset', String(offset + limit));
    q.set('limit', String(limit));
    links.next = `${base}?${q.toString()}`;
  }
  if (offset > 0) {
    q.set('offset', String(Math.max(0, offset - limit)));
    q.set('limit', String(limit));
    links.prev = `${base}?${q.toString()}`;
  }
  return links;
}

module.exports = { weakEtag, applyConditionalGet, paginationLinks };
