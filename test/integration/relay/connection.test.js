'use strict';

import {expect} from 'chai';
import helper from '../helper';
import Sequelize from 'sequelize';
import sinon from 'sinon';
import attributeFields from '../../../src/attributeFields';
import resolver from '../../../src/resolver';

const {
  sequelize,
  Promise
} = helper;

import {
  sequelizeConnection
} from '../../../src/relay';

import {
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLNonNull,
  GraphQLBoolean,
  GraphQLEnumType,
  GraphQLList,
  GraphQLObjectType,
  GraphQLSchema,
  graphql
} from 'graphql';

import {
  globalIdField,
  toGlobalId,
  fromGlobalId
} from 'graphql-relay';

if (helper.sequelize.dialect.name === 'postgres') {
  describe('relay', function () {
    describe('connection', function () {
      before(async function () {
        var self = this;

        this.User = sequelize.define('user', {

        });

        this.Project = sequelize.define('project', {

        });

        this.Task = sequelize.define('task', {
          name: Sequelize.STRING,
          completed: Sequelize.BOOLEAN
        }, {
          timestamps: true
        });

        this.ProjectMember = sequelize.define('projectMember', {

        });

        this.User.Tasks = this.User.hasMany(this.Task, {as: 'tasks'});
        this.User.Projects = this.User.belongsToMany(this.Project, {as: 'projects', through: this.ProjectMember});

        this.Project.Tasks = this.Project.hasMany(this.Task, {as: 'tasks'});
        this.Task.Project = this.Task.belongsTo(this.Project, {as: 'project'});

        this.taskType = new GraphQLObjectType({
          name: this.Task.name,
          fields: {
            ...attributeFields(this.Task),
            id: globalIdField(this.Task.name)
          }
        });

        this.projectTaskConnectionFieldSpy = sinon.spy();
        this.projectTaskConnection = sequelizeConnection({
          name: this.Project.name + this.Task.name,
          nodeType: this.taskType,
          target: this.Project.Tasks,
          orderBy: new GraphQLEnumType({
            name: this.Project.name + this.Task.name + 'ConnectionOrder',
            values: {
              ID: {value: [this.Task.primaryKeyAttribute, 'ASC']},
              LATEST: {value: ['createdAt', 'DESC']},
              NAME: {value: ['name', 'ASC']}
            }
          }),
          connectionFields: () => ({
            totalCount: {
              type: GraphQLInt,
              resolve: function(connection, args, {rootValue}) {
                self.projectTaskConnectionFieldSpy(connection);
                return connection.source.countTasks({
                  where: connection.where,
                  logging: rootValue.logging
                });
              }
            }
          }),
        });

        this.projectType = new GraphQLObjectType({
          name: this.Project.name,
          fields: {
            ...attributeFields(this.Project),
            id: globalIdField(this.Project.name),
            tasks: {
              type: this.projectTaskConnection.connectionType,
              args: this.projectTaskConnection.connectionArgs,
              resolve: this.projectTaskConnection.resolve
            },
          }
        });

        this.userTaskConnectionFieldSpy = sinon.spy();
        this.userTaskConnection = sequelizeConnection({
          name: this.User.name + this.Task.name,
          nodeType: this.taskType,
          target: this.User.Tasks,
          orderBy: new GraphQLEnumType({
            name: this.User.name + this.Task.name + 'ConnectionOrder',
            values: {
              ID: {value: [this.Task.primaryKeyAttribute, 'ASC']},
              LATEST: {value: ['createdAt', 'DESC']},
              NAME: {value: ['name', 'ASC']}
            }
          }),
          connectionFields: () => ({
            totalCount: {
              type: GraphQLInt,
              resolve: function(connection, args, {rootValue}) {
                self.userTaskConnectionFieldSpy(connection);
                return connection.source.countTasks({
                  where: connection.where,
                  logging: rootValue.logging
                });
              }
            }
          }),
          where: (key, value) => {
            if (key === 'completed') {
              value = !!value;
            }
            return {[key]: value};
          }
        });

        this.userProjectConnection = sequelizeConnection({
          name: this.Project.name,
          nodeType: this.projectType,
          target: this.User.Projects,
          orderBy: new GraphQLEnumType({
            name: this.User.name + this.Project.name + 'ConnectionOrder',
            values: {
              ID: {value: [this.Project.primaryKeyAttribute, 'ASC']}
            }
          })
        });

        this.userType = new GraphQLObjectType({
          name: this.User.name,
          fields: {
            ...attributeFields(this.User),
            id: globalIdField(this.User.name),
            tasks: {
              type: this.userTaskConnection.connectionType,
              args: {
                ...this.userTaskConnection.connectionArgs,
                completed: {
                  type: GraphQLBoolean
                }
              },
              resolve: this.userTaskConnection.resolve
            },
            projects: {
              type: this.userProjectConnection.connectionType,
              args: this.userProjectConnection.connectionArgs,
              resolve: this.userProjectConnection.resolve
            }
          }
        });

        this.schema = new GraphQLSchema({
          query: new GraphQLObjectType({
            name: 'RootQueryType',
            fields: {
              user: {
                type: this.userType,
                args: {
                  id: {
                    type: new GraphQLNonNull(GraphQLInt)
                  }
                },
                resolve: resolver(this.User)
              }
            }
          })
        });

        await this.sequelize.sync({force: true});

        let taskId = 0
          , now = new Date(2015, 10, 17, 3, 24, 0, 0);

        [this.projectA, this.projectB] = await Promise.join(
          this.Project.create({}),
          this.Project.create({})
        );
        
        this.userA = await this.User.create({
          [this.User.Tasks.as]: [
            {id: ++taskId, name: 'AAA', createdAt: new Date(now - 45000), projectId: this.projectA.get('id'), completed: false},
            {id: ++taskId, name: 'ABA', createdAt: new Date(now - 40000), projectId: this.projectA.get('id'), completed: true},
            {id: ++taskId, name: 'ABC', createdAt: new Date(now - 35000), projectId: this.projectA.get('id'), completed: true},
            {id: ++taskId, name: 'ABC', createdAt: new Date(now - 30000), projectId: this.projectA.get('id'), completed: false},
            {id: ++taskId, name: 'BAA', createdAt: new Date(now - 25000), projectId: this.projectA.get('id'), completed: false},
            {id: ++taskId, name: 'BBB', createdAt: new Date(now - 20000), projectId: this.projectB.get('id'), completed: true},
            {id: ++taskId, name: 'CAA', createdAt: new Date(now - 15000), projectId: this.projectB.get('id'), completed: true},
            {id: ++taskId, name: 'CCC', createdAt: new Date(now - 10000), projectId: this.projectB.get('id'), completed: false},
            {id: ++taskId, name: 'DDD', createdAt: new Date(now - 5000), projectId: this.projectB.get('id'), completed: false}
          ]
        }, {
          include: [this.User.Tasks]
        });

        await Promise.join(
          this.ProjectMember.create({
            projectId: this.projectA.get('id'),
            userId: this.userA.get('id')
          }),
          this.ProjectMember.create({
            projectId: this.projectB.get('id'),
            userId: this.userA.get('id')
          })
        );
      });

      it('should support in-query slicing and pagination with first and orderBy', async function () {
        let firstThree = this.userA.tasks.slice(this.userA.tasks.length - 3, this.userA.tasks.length);
        let nextThree = this.userA.tasks.slice(this.userA.tasks.length - 6, this.userA.tasks.length - 3);
        let lastThree = this.userA.tasks.slice(this.userA.tasks.length - 9, this.userA.tasks.length - 6);

        expect(firstThree.length).to.equal(3);
        expect(nextThree.length).to.equal(3);
        expect(lastThree.length).to.equal(3);

        let verify = function(result, expectedTasks) {
          if (result.errors) throw new Error(result.errors[0].stack);

          var resultTasks = result.data.user.tasks.edges.map(function (edge) {
            return edge.node;
          });

          let resultIds = resultTasks.map((task) => {
            return parseInt(fromGlobalId(task.id).id, 10);
          }).sort();

          let expectedIds = expectedTasks.map(function (task) {
            return task.get('id');
          }).sort();

          expect(resultTasks.length).to.equal(3);
          expect(resultIds).to.deep.equal(expectedIds);
        };

        let query = (after) => {
          return graphql(this.schema, `
            {
              user(id: ${this.userA.id}) {
                tasks(first: 3, ${after ? 'after: "'+after+'", ' : ''} orderBy: LATEST) {
                  edges {
                    cursor
                    node {
                      id
                      name
                    }
                  }
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                }
              }
            }
          `);
        };

        let firstResult = await query();
        verify(firstResult, firstThree);
        expect(firstResult.data.user.tasks.pageInfo.hasNextPage).to.equal(true);

        let nextResult = await query(firstResult.data.user.tasks.pageInfo.endCursor);
        verify(nextResult, nextThree);
        expect(nextResult.data.user.tasks.pageInfo.hasNextPage).to.equal(true);

        let lastResult = await query(nextResult.data.user.tasks.edges[2].cursor);
        verify(lastResult, lastThree);
        expect(lastResult.data.user.tasks.pageInfo.hasNextPage).to.equal(false);
      });

      it('should support in-query slicing with user provided args/where', async function () {
        let result = await graphql(this.schema, `
          {
            user(id: ${this.userA.id}) {
              tasks(first: 2, completed: true, orderBy: LATEST) {
                edges {
                  node {
                    id
                    name
                  }
                }
              }
            }
          }
        `);

        if (result.errors) throw new Error(result.errors[0].stack);

        expect(result.data.user.tasks.edges.length).to.equal(2);
        expect(result.data.user.tasks.edges.map(task => {
          return parseInt(fromGlobalId(task.node.id).id, 10);
        })).to.deep.equal([
          this.userA.tasks[6].id,
          this.userA.tasks[5].id,
        ]);
      });

      it('should support nested aliased fields', async function () {
        let result = await graphql(this.schema, `
          {
            user(id: ${this.userA.id}) {
              tasks(first: 1, completed: true, orderBy: LATEST) {
                edges {
                  node {
                    id
                    title: name
                  }
                }
              }
            }
          }
        `);

        if (result.errors) throw new Error(result.errors[0].stack);
        expect(result.data.user.tasks.edges[0].node.title).to.equal('CAA');
      });

      it('should support reverse pagination with last and orderBy', async function () {
        let firstThree = this.userA.tasks.slice(0, 3);
        let nextThree = this.userA.tasks.slice(3, 6);
        let lastThree = this.userA.tasks.slice(6, 9);

        expect(firstThree.length).to.equal(3);
        expect(nextThree.length).to.equal(3);
        expect(lastThree.length).to.equal(3);

        let verify = function(result, expectedTasks) {
          if (result.errors) throw new Error(result.errors[0].stack);

          var resultTasks = result.data.user.tasks.edges.map(function (edge) {
            return edge.node;
          });

          let resultIds = resultTasks.map((task) => {
            return parseInt(fromGlobalId(task.id).id, 10);
          }).sort();

          let expectedIds = expectedTasks.map(function (task) {
            return task.get('id');
          }).sort();

          expect(resultTasks.length).to.equal(3);
          expect(resultIds).to.deep.equal(expectedIds);
        };

        let query = (before) => {
          return graphql(this.schema, `
            {
              user(id: ${this.userA.id}) {
                tasks(last: 3, ${before ? 'before: "'+before+'", ' : ''} orderBy: LATEST) {
                  edges {
                    cursor
                    node {
                      id
                      name
                    }
                  }
                  pageInfo {
                    hasPreviousPage
                    endCursor
                  }
                }
              }
            }
          `);
        };

        let firstResult = await query();
        verify(firstResult, firstThree);
        expect(firstResult.data.user.tasks.pageInfo.hasPreviousPage).to.equal(true);

        let nextResult = await query(firstResult.data.user.tasks.pageInfo.endCursor);
        verify(nextResult, nextThree);
        expect(nextResult.data.user.tasks.pageInfo.hasPreviousPage).to.equal(true);

        let lastResult = await query(nextResult.data.user.tasks.edges[2].cursor);
        verify(lastResult, lastThree);
        expect(lastResult.data.user.tasks.pageInfo.hasPreviousPage).to.equal(false);
      });

      it('should support fetching the next element although it has the same orderValue', async function () {
        let firstResult = await graphql(this.schema, `
          {
            user(id: ${this.userA.id}) {
              tasks(first: 3, orderBy: NAME) {
                edges {
                  cursor
                  node {
                    id
                    name
                  }
                }
                pageInfo {
                  endCursor
                }
              }
            }
          }
        `);

        let secondResult = await graphql(this.schema, `
          {
            user(id: ${this.userA.id}) {
              tasks(first: 3, after: "${firstResult.data.user.tasks.pageInfo.endCursor}", orderBy: NAME) {
                edges {
                  cursor
                  node {
                    id
                    name
                  }
                }
                pageInfo {
                  endCursor
                }
              }
            }
          }
        `);

        expect(firstResult.data.user.tasks.edges[2].node.name).to.equal('ABC');
        expect(firstResult.data.user.tasks.edges[2].node.name).to.equal(secondResult.data.user.tasks.edges[0].node.name);
      });

      it('should support prefetching two nested connections', async function () {
        let sqlSpy = sinon.spy();

        let result = await graphql(this.schema, `
          {
            user(id: ${this.userA.id}) {
              projects {
                edges {
                  node {
                    tasks {
                      edges {
                        cursor
                        node {
                          id
                          name
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `, {
          logging: sqlSpy
        });

        if (result.errors) throw new Error(result.errors[0].stack);

        expect(sqlSpy.callCount).to.equal(1);
        expect(result.data.user.projects.edges[1].node.tasks.edges[2].node.name).to.equal('CCC');
      });

      it('should support paging a nested connection', async function () {
        let sqlSpy = sinon.spy();

        let result = await graphql(this.schema, `
          {
            user(id: ${this.userA.id}) {
              projects {
                edges {
                  node {
                    tasks(first: 3, orderBy: LATEST) {
                      edges {
                        cursor
                        node {
                          id
                          name
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `, {
          logging: sqlSpy
        });

        if (result.errors) throw new Error(result.errors[0].stack);

        let projects = result.data.user.projects.edges.map(function (edge) {
          return edge.node;
        });

        expect(projects[0].tasks.edges.length).to.equal(3);
        expect(projects[1].tasks.edges.length).to.equal(3);

        expect(projects[0].tasks.edges[0].node.id).to.equal(toGlobalId(this.Task.name, this.userA.tasks[4].get('id')));
        expect(projects[1].tasks.edges[0].node.id).to.equal(toGlobalId(this.Task.name, this.userA.tasks[8].get('id')));

        expect(sqlSpy.callCount).to.equal(2);
      });

      it('should support connection fields', async function () {
        let sqlSpy = sinon.spy();

        let result = await graphql(this.schema, `
          {
            user(id: ${this.userA.id}) {
              tasks {
                totalCount
              }
            }
          }
        `, {
          logging: sqlSpy
        });

        if (result.errors) throw new Error(result.errors[0].stack);

        expect(result.data.user.tasks.totalCount).to.equal(9);
        expect(this.userTaskConnectionFieldSpy.firstCall.args[0].source.get('tasks')).to.be.undefined;
      });

      it('should support connection fields on nested connections', async function () {
        let sqlSpy = sinon.spy();

        let result = await graphql(this.schema, `
          {
            user(id: ${this.userA.id}) {
              projects {
                edges {
                  node {
                    tasks {
                      totalCount
                    }
                  }
                }
              }
            }
          }
        `, {
          logging: sqlSpy
        });

        if (result.errors) throw new Error(result.errors[0].stack);

        expect(result.data.user.projects.edges[0].node.tasks.totalCount).to.equal(5);
        expect(result.data.user.projects.edges[1].node.tasks.totalCount).to.equal(4);
        expect(this.projectTaskConnectionFieldSpy.firstCall.args[0].source.get('tasks')).to.be.undefined;
      });

      it('should support connection fields with args/where', async function () {
        let sqlSpy = sinon.spy();

        let result = await graphql(this.schema, `
          {
            user(id: ${this.userA.id}) {
              tasks(completed: true) {
                totalCount
              }
            }
          }
        `, {
          logging: sqlSpy
        });

        if (result.errors) throw new Error(result.errors[0].stack);

        expect(result.data.user.tasks.totalCount).to.equal(4);
        expect(this.userTaskConnectionFieldSpy.firstCall.args[0].source.get('tasks')).to.be.undefined;
      });

      it('should not barf on paging if there are no connection edges', async function () {
        let user = await this.User.create({});

        let result = await graphql(this.schema, `
          {
            user(id: ${user.get('id')}) {
              tasks(first: 10) {
                totalCount

                edges {
                  node {
                    id
                  }
                }

                pageInfo {
                  hasNextPage
                }
              }
            }
          }
        `, {});

        if (result.errors) throw new Error(result.errors[0].stack);
        expect(result.data.user).not.to.be.null;
        expect(result.data.user.tasks.totalCount).to.equal(0);
        expect(result.data.user.tasks.pageInfo.hasNextPage).to.equal(false);
      });
    });
  });
}