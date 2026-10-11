/** The saved circle and the generation statistic always commit together. */
export function circleWriteStatements(id: string, username: string, data: string, consent: boolean, now = Date.now()) {
  return [
    { sql: 'INSERT INTO yahoo_circles(id,username,circle_data,storage_consent,consented_at,created_at) VALUES(?,?,?,?,?,?)', values: [id, username, data, consent ? 1 : 0, consent ? now : null, now] },
    { sql: 'INSERT INTO generation_log(source,username,created_at) VALUES(?,?,?)', values: ['yahoo', username, now] },
  ];
}
