import { getCollection } from 'astro:content';
import collectionsData from '../data/collections.json';

export const sortDate = (e) => {
  const d = e.data.dateFinished || e.data.dateStarted || e.data.dateAdded;
  return d ? new Date(d).getTime() : 0;
};

export const byRecent = (a, b) => sortDate(b) - sortDate(a);

export async function getItems() {
  const items = await getCollection('items');
  return items.sort(byRecent);
}

export function getShelves() {
  return collectionsData;
}

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
