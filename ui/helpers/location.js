export const getAllUrlParams = function getAllUrlParams() {
  return new URLSearchParams(location.hash.split('?')[1]);
};

export const getUrlParam = function getUrlParam(name) {
  return getAllUrlParams().get(name);
};

export const getAllUrlParamsAsObject = function getAllUrlParamsAsObject() {
  const params = getAllUrlParams();

  return [...params.entries()].reduce((acc, [key, value]) => (
    { ...acc, [key]: value }
  ), {});
};
