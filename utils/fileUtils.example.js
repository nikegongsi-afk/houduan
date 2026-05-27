/**
 * 文件工具使用示例
 * 
 * 使用项目内的 temp 目录保存文件，避免权限问题
 */

const { 
  getTempDir, 
  saveFileToTemp, 
  readFileFromTemp, 
  deleteFileFromTemp,
  getTempFilePath 
} = require('./fileUtils');

// 示例 1: 保存文本文件
function exampleSaveText() {
  try {
    const filePath = saveFileToTemp('example.txt', '这是示例内容', 'texts');
    console.log('文件已保存:', filePath);
  } catch (error) {
    console.error('保存失败:', error);
  }
}

// 示例 2: 保存二进制文件（Buffer）
function exampleSaveBuffer() {
  try {
    const buffer = Buffer.from('二进制内容', 'utf8');
    const filePath = saveFileToTemp('example.bin', buffer, 'binary');
    console.log('文件已保存:', filePath);
  } catch (error) {
    console.error('保存失败:', error);
  }
}

// 示例 3: 读取文件
function exampleReadFile() {
  try {
    const content = readFileFromTemp('example.txt', 'texts');
    console.log('文件内容:', content.toString());
  } catch (error) {
    console.error('读取失败:', error);
  }
}

// 示例 4: 删除文件
function exampleDeleteFile() {
  try {
    const deleted = deleteFileFromTemp('example.txt', 'texts');
    console.log('删除结果:', deleted);
  } catch (error) {
    console.error('删除失败:', error);
  }
}

// 示例 5: 获取临时目录路径
function exampleGetTempDir() {
  const tempDir = getTempDir();
  console.log('临时目录:', tempDir);
}

module.exports = {
  exampleSaveText,
  exampleSaveBuffer,
  exampleReadFile,
  exampleDeleteFile,
  exampleGetTempDir
};

