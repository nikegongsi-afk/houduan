const fs = require('fs');
const path = require('path');

/**
 * 获取项目内的临时文件目录
 * 使用项目内的 temp 目录，避免权限问题
 */
function getTempDir() {
  const projectRoot = path.join(__dirname, '..');
  const tempDir = path.join(projectRoot, 'temp');
  
  // 确保目录存在
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  return tempDir;
}

/**
 * 保存文件到项目内的临时目录
 * @param {string} fileName - 文件名
 * @param {Buffer|string} content - 文件内容
 * @param {string} subDir - 可选的子目录
 * @returns {string} 保存的文件路径
 */
function saveFileToTemp(fileName, content, subDir = '') {
  try {
    const tempDir = getTempDir();
    let targetDir = tempDir;
    
    // 如果有子目录，创建子目录
    if (subDir) {
      targetDir = path.join(tempDir, subDir);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
    }
    
    const filePath = path.join(targetDir, fileName);
    
    // 写入文件
    if (Buffer.isBuffer(content)) {
      fs.writeFileSync(filePath, content);
    } else {
      fs.writeFileSync(filePath, content, 'utf8');
    }
    
    console.log(`文件已保存到: ${filePath}`);
    return filePath;
  } catch (error) {
    console.error('保存文件失败:', error);
    throw new Error(`保存文件失败: ${error.message}`);
  }
}

/**
 * 从临时目录读取文件
 * @param {string} fileName - 文件名
 * @param {string} subDir - 可选的子目录
 * @returns {Buffer} 文件内容
 */
function readFileFromTemp(fileName, subDir = '') {
  try {
    const tempDir = getTempDir();
    let targetDir = tempDir;
    
    if (subDir) {
      targetDir = path.join(tempDir, subDir);
    }
    
    const filePath = path.join(targetDir, fileName);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }
    
    return fs.readFileSync(filePath);
  } catch (error) {
    console.error('读取文件失败:', error);
    throw new Error(`读取文件失败: ${error.message}`);
  }
}

/**
 * 删除临时目录中的文件
 * @param {string} fileName - 文件名
 * @param {string} subDir - 可选的子目录
 * @returns {boolean} 是否删除成功
 */
function deleteFileFromTemp(fileName, subDir = '') {
  try {
    const tempDir = getTempDir();
    let targetDir = tempDir;
    
    if (subDir) {
      targetDir = path.join(tempDir, subDir);
    }
    
    const filePath = path.join(targetDir, fileName);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`文件已删除: ${filePath}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('删除文件失败:', error);
    throw new Error(`删除文件失败: ${error.message}`);
  }
}

/**
 * 获取临时文件的完整路径
 * @param {string} fileName - 文件名
 * @param {string} subDir - 可选的子目录
 * @returns {string} 文件路径
 */
function getTempFilePath(fileName, subDir = '') {
  const tempDir = getTempDir();
  let targetDir = tempDir;
  
  if (subDir) {
    targetDir = path.join(tempDir, subDir);
  }
  
  return path.join(targetDir, fileName);
}

module.exports = {
  getTempDir,
  saveFileToTemp,
  readFileFromTemp,
  deleteFileFromTemp,
  getTempFilePath
};

