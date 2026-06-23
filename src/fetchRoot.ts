async function fetchCollections() {
  const url = "https://firestore.googleapis.com/v1/projects/rappo-8ed6a/databases/(default)/documents";
  const response = await fetch(url);
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}
fetchCollections();
