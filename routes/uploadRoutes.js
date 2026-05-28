const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { uploadFile } = require('../config/supabase');

const VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/webm',
  'video/avi',
  'video/mov',
  'video/mkv',
]);

const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/octet-stream',
]);

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm']);
const DOCUMENT_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'rar']);

const getExtension = (filename = '') => {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
};

const isAllowedUpload = (req, file) => {
  const ext = getExtension(file.originalname);
  const url = req.originalUrl || '';

  if (url.includes('/images')) {
    return file.mimetype.startsWith('image/');
  }

  if (url.includes('/videos')) {
    return VIDEO_MIME_TYPES.has(file.mimetype) || VIDEO_EXTENSIONS.has(ext);
  }

  if (url.includes('/documents')) {
    return DOCUMENT_MIME_TYPES.has(file.mimetype) || DOCUMENT_EXTENSIONS.has(ext);
  }

  return false;
};

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (isAllowedUpload(req, file)) {
      cb(null, true);
      return;
    }
    cb(new Error('不支持的文件类型'));
  }
});

const buildUploadResponse = (req, result, fileName) => ({
  success: true,
  data: {
    url: result.url,
    path: result.path,
    fileName,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size
  }
});

const handleSingleUpload = (bucketName) => async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '没有文件被上传' });
    }

    const fileExtension = getExtension(req.file.originalname) || 'bin';
    const fileName = `${uuidv4()}.${fileExtension}`;
    const result = await uploadFile(bucketName, fileName, req.file.buffer, req.file.mimetype);

    res.status(201).json(buildUploadResponse(req, result, fileName));
  } catch (error) {
    console.error(`${bucketName} 上传失败:`, error);
    res.status(500).json({
      success: false,
      error: `${bucketName} 上传失败`,
      details: error.message
    });
  }
};

router.post('/images', upload.single('file'), handleSingleUpload('images'));
router.post('/videos', upload.single('file'), handleSingleUpload('videos'));
router.post('/documents', upload.single('file'), handleSingleUpload('documents'));

router.post('/images/batch', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: '没有文件被上传' });
    }

    const uploadPromises = req.files.map(async (file) => {
      const fileExtension = getExtension(file.originalname) || 'bin';
      const fileName = `${uuidv4()}.${fileExtension}`;
      const result = await uploadFile('images', fileName, file.buffer, file.mimetype);

      return {
        url: result.url,
        path: result.path,
        fileName,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size
      };
    });

    const results = await Promise.all(uploadPromises);

    res.status(201).json({
      success: true,
      data: results,
      total: results.length
    });
  } catch (error) {
    console.error('批量图片上传失败:', error);
    res.status(500).json({
      success: false,
      error: '批量图片上传失败',
      details: error.message
    });
  }
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      error: err.code === 'LIMIT_FILE_SIZE' ? '文件大小超过限制（最大 200MB）' : err.message
    });
  }

  if (err && err.message === '不支持的文件类型') {
    return res.status(400).json({ success: false, error: err.message });
  }

  next(err);
});

module.exports = router;
