import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const EMPLOYEE_TABLE_NAME = process.env.EMPLOYEE_TABLE_NAME;

const seedEmployees = [
  { id: 'e001', name: '山田 太郎', email: 'taro.yamada@strongsystem.com', department: '開発部', position: '主任', hireDate: '2015-04-01' },
  { id: 'e002', name: '鈴木 花子', email: 'hanako.suzuki@strongsystem.com', department: '営業部', position: '課長', hireDate: '2010-04-01' },
  { id: 'e003', name: '佐藤 一郎', email: 'ichiro.sato@strongsystem.com', department: '管理部', position: '部長', hireDate: '2005-04-01' },
  { id: 'e004', name: '田中 恵子', email: 'keiko.tanaka@strongsystem.com', department: '人事部', position: '主任', hireDate: '2018-04-01' },
  { id: 'e005', name: '伊藤 健太', email: 'kenta.ito@strongsystem.com', department: '開発部', position: '社員', hireDate: '2020-04-01' },
  { id: 'e006', name: '高橋 美咲', email: 'misaki.takahashi@strongsystem.com', department: '営業部', position: '社員', hireDate: '2019-04-01' },
  { id: 'e007', name: '渡辺 雄介', email: 'yusuke.watanabe@strongsystem.com', department: '開発部', position: '課長', hireDate: '2012-04-01' },
  { id: 'e008', name: '小林 由美', email: 'yumi.kobayashi@strongsystem.com', department: '人事部', position: '社員', hireDate: '2021-04-01' },
  { id: 'e009', name: '加藤 大輔', email: 'daisuke.kato@strongsystem.com', department: '管理部', position: '主任', hireDate: '2016-04-01' },
  { id: 'e010', name: '吉田 麻衣', email: 'mai.yoshida@strongsystem.com', department: '営業部', position: '主任', hireDate: '2017-04-01' },
];

export const handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  const requestType = event.RequestType;

  if (requestType === 'Delete') {
    return sendResponse(event, 'SUCCESS', { Message: 'Delete not required' });
  }

  if (requestType === 'Create' || requestType === 'Update') {
    try {
      const now = new Date().toISOString();
      
      const putRequests = seedEmployees.map(emp => ({
        PutRequest: {
          Item: {
            ...emp,
            createdAt: now,
            updatedAt: now,
          },
        },
      }));

      const command = new BatchWriteCommand({
        RequestItems: {
          [EMPLOYEE_TABLE_NAME]: putRequests,
        },
      });

      await docClient.send(command);
      
      console.log('Seed data inserted successfully');
      return sendResponse(event, 'SUCCESS', { Message: 'Seed data inserted' });
    } catch (error) {
      console.error('Error:', error);
      return sendResponse(event, 'FAILED', { Message: error.message });
    }
  }

  return sendResponse(event, 'FAILED', { Message: 'Unknown request type' });
};

async function sendResponse(event, status, data) {
  const responseBody = JSON.stringify({
    Status: status,
    Reason: data.Message,
    PhysicalResourceId: event.LogicalResourceId,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: data,
  });

  console.log('Response:', responseBody);

  const parsedUrl = new URL(event.ResponseURL);
  const options = {
    method: 'PUT',
    headers: {
      'Content-Type': '',
      'Content-Length': responseBody.length,
    },
    body: responseBody,
  };

  try {
    const response = await fetch(event.ResponseURL, options);
    console.log('CloudFormation response status:', response.status);
  } catch (error) {
    console.error('Error sending response:', error);
  }
}
