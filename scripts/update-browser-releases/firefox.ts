/* This file is a part of @mdn/browser-compat-data
 * See LICENSE file for more information. */

import * as fs from 'node:fs';

import stringify from '../lib/stringify-and-order-properties.js';

import { newBrowserEntry, updateBrowserEntry } from './utils.js';

import type { ReleaseStatement } from '../../types/types.js';

/**
 * getFirefoxReleaseNotesURL - Guess the URL of the release notes
 * @param {string} version release version
 * @returns {string} The URL of the release notes or the empty string if not found
 */
const getFirefoxReleaseNotesURL = async (version) => {
  if (version === '1') {
    return 'https://website-archive.mozilla.org/www.mozilla.org/firefox_releasenotes/en-US/firefox/releases/1.0.html';
  }
  return `https://developer.mozilla.org/docs/Mozilla/Firefox/Releases/${version}`;
};

/**
 * updateFirefoxFile - Update the json file listing the browser version of a chromium entry
 * @param {object} options The list of options for this type of chromiums.
 */
export const updateFirefoxReleases = async (options) => {
  //
  // Get the firefox.json from the local BCD
  //
  const file = fs.readFileSync(`${options.bcdFile}`);
  const firefoxBCD = JSON.parse(file.toString());

  //
  // Update the three channels
  //
  const channels = new Map([
    ['current', options.releaseBranch],
    ['beta', options.betaBranch],
    ['nightly', options.nightlyBranch],
  ]);
  const data = {};

  let stableRelease = 1; // We will need this info afterwards; it will be calculated in the loop.

  for (const [key, value] of channels) {
    let releaseNotesURL;
    // Extract version and release date
    if (key !== 'current') {
      // Get the JSON for the given train
      const trainInfo = await fetch(`${options.firefoxScheduleURL}${value}`);
      const train = await trainInfo.json();

      releaseNotesURL = await getFirefoxReleaseNotesURL(
        parseFloat(train.version).toString(),
      );

      data[value] = {};
      data[value].version = parseFloat(train.version).toString();
      data[value].releaseDate = train.release.substring(0, 10); // Remove the time part
    } else {
      // Get the JSON with all released versions and their dates
      const firefoxVersions = await fetch(options.firefoxReleaseDateURL);
      const releasedFirefoxVersions = await firefoxVersions.json();

      // Extract the current stable version and its release date

      Object.entries(releasedFirefoxVersions).forEach(([key]) => {
        if (parseFloat(key) > stableRelease) {
          stableRelease = parseFloat(key);
        }
      });
      releaseNotesURL = await getFirefoxReleaseNotesURL(stableRelease);

      data[value] = {};
      data[value].version = stableRelease;
      data[value].releaseDate = releasedFirefoxVersions[stableRelease + '.0'];
    }

    if (
      firefoxBCD.browsers[options.bcdBrowserName].releases[data[value].version]
    ) {
      updateBrowserEntry(
        firefoxBCD,
        options.bcdBrowserName,
        data[value].version,
        data[value].releaseDate,
        key,
        releaseNotesURL,
      );
    } else {
      // New entry
      newBrowserEntry(
        firefoxBCD,
        options.bcdBrowserName,
        data[value].version,
        key,
        'Gecko',
        data[value].releaseDate,
        releaseNotesURL,
      );
    }
  }

  //
  // Set all older releases are 'retired' (and the current ESR to 'esr')
  //

  // Find latest ESR

  // Get the JSON with all released versions and their dates
  const firefoxESRVersions = await fetch(options.firefoxESRDateURL);
  const esrFirefoxVersions = await firefoxESRVersions.json();

  // Extract the current esr version
  let esrRelease = 1;

  Object.entries(esrFirefoxVersions).forEach(([key]) => {
    if (parseInt(key) > esrRelease) {
      esrRelease = parseInt(key);
    }
  });

  // Replace all old entries with 'retired' or 'esr'
  Object.entries(
    firefoxBCD.browsers[options.bcdBrowserName].releases as {
      [version: string]: ReleaseStatement;
    },
  ).forEach(([key, entry]) => {
    if (key === String(esrRelease)) {
      updateBrowserEntry(
        firefoxBCD,
        options.bcdBrowserName,
        key,
        entry.release_date,
        'esr',
        '',
      );
    } else if (parseFloat(key) < stableRelease) {
      updateBrowserEntry(
        firefoxBCD,
        options.bcdBrowserName,
        key,
        entry.release_date,
        'retired',
        '',
      );
    }
  });

  //
  // Add a planned version entry
  //
  const planned = stableRelease + 3;
  // Get the JSON for the planned version train
  const trainInfo = await fetch(`${options.firefoxScheduleURL}${planned}`);
  const train = await trainInfo.json();

  if (firefoxBCD.browsers[options.bcdBrowserName].releases[planned]) {
    updateBrowserEntry(
      firefoxBCD,
      options.bcdBrowserName,
      planned,
      train.release.substring(0, 10),
      'planned',
      '',
    );
  } else {
    // New entry
    newBrowserEntry(
      firefoxBCD,
      options.bcdBrowserName,
      planned,
      'planned',
      'Gecko',
      train.release.substring(0, 10), // Remove the time part
      await getFirefoxReleaseNotesURL(planned),
    );
  }

  //
  // Write the update browser's json to file
  //
  fs.writeFileSync(`./${options.bcdFile}`, stringify(firefoxBCD) + '\n');
};
