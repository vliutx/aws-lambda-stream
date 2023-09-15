import {
  printStartPipeline, printEndPipeline,
  faulty, faultyAsyncStream, faultify,
  queryDynamoDB, batchGetDynamoDB, toPkQueryRequest,
  encryptEvent,
} from '../utils';

import { filterOnEventType, filterOnContent, outLatched } from '../filters';

export const cdc = (rule) => (s) => s // eslint-disable-line import/prefer-default-export
  .filter(outLatched)

  .filter(onEventType(rule))
  .tap(printStartPipeline)

  .filter(onContent(rule))

  .map(toQueryRequest(rule))
  .through(queryDynamoDB(rule))

  .map(toGetRequest(rule))
  .through(batchGetDynamoDB(rule))

  .map(toEvent(rule))
  .parallel(rule.parallel || Number(process.env.PARALLEL) || 4)

  .through(encryptEvent({
    sourceField: rule.eventField || 'event',
    targetField: rule.eventField || 'event',
    ...rule,
  }))
  .through(rule.publish(rule))

  .tap(printEndPipeline);

const onEventType = (rule) => faulty((uow) => filterOnEventType(rule, uow));
const onContent = (rule) => faulty((uow) => filterOnContent(rule, uow));

const toQueryRequest = (rule) => faulty((uow) => ({
  ...uow,
  queryRequest:
    rule.toQueryRequest // eslint-disable-line no-nested-ternary
      ? /* istanbul ignore next */ rule.toQueryRequest(uow, rule)
      : !rule.queryRelated
        ? undefined
        : toPkQueryRequest(uow, rule),
}));

const toGetRequest = (rule) => faulty((uow) => ({
  ...uow,
  batchGetRequest:
    rule.toGetRequest
      ? /* istanbul ignore next */ rule.toGetRequest(uow, rule)
      : undefined,
}));

const toEvent = (rule) => faultyAsyncStream(async (uow) => (!rule.toEvent // eslint-disable-line no-nested-ternary
  ? uow : typeof rule.eventField === 'string' && rule.eventField !== 'event'
    ? ({
      ...uow,
      [rule.eventField]: await faultify(rule.toEvent)(uow, rule),
    })
    : ({
      ...uow,
      event: {
        ...uow.event,
        ...await faultify(rule.toEvent)(uow, rule),
      },
    })));
