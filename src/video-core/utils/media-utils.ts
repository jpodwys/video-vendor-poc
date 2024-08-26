export const supportsSetSinkId = () => {
  return !!document.createElement('audio').setSinkId;
};
