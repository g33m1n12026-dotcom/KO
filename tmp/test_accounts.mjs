import { loadSettings, getPublicAccountStatus, loginDocer, login4shared } from './server/settings.js';
import { searchZLibrary } from './server/search.js';
import { searchChomikujBooks } from './server/chomikuj.js';

async function run() {
  console.log('Testing settings & accounts...');
  loadSettings();
  console.log('Public status:', getPublicAccountStatus());

  // Test Z-Library
  try {
    const zlibRes = await searchZLibrary('lem');
    console.log('Z-Library test:', zlibRes.length > 0 ? `SUCCESS (${zlibRes.length} items)` : 'FAILED (0 items)');
  } catch (e) {
    console.log('Z-Library error:', e.message);
  }

  // Test Chomikuj
  try {
    const chomikRes = await searchChomikujBooks('lem');
    console.log('Chomikuj test:', chomikRes.length > 0 ? `SUCCESS (${chomikRes.length} items)` : 'FAILED (0 items)');
  } catch (e) {
    console.log('Chomikuj error:', e.message);
  }

  // Test 4shared API
  try {
    const fsRes = await fetch('https://www.4shared.com/web/rest/v1_2/files?query=lem', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const fsData = await fsRes.json();
    console.log('4shared API test:', fsData.files ? `SUCCESS (${fsData.files.length} items)` : 'FAILED');
  } catch (e) {
    console.log('4shared error:', e.message);
  }

  // Test Docer login
  try {
    const docerOk = await loginDocer();
    console.log('Docer login test:', docerOk ? 'SUCCESS' : 'COOKIE SAVED');
  } catch (e) {
    console.log('Docer error:', e.message);
  }
}

run();
