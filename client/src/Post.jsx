import React from 'react';
import {formatISO9075} from "date-fns"
export default function Post({title, summary, imageURL, content ,createdAt,author}) {
  return (
    <div className="post">
      <div className="image">
        <img
          src={imageURL}
          height="200px"
          alt="Post cover"
        />
      </div>

      <div className="texts">
        <h2>{title}</h2>
        <p className="info">
          <a className="author">{author.username}</a>
          <time>{formatISO9075(new Date(createdAt))}</time>
        </p>
        <p className="summary">
          {summary}
        </p>
      </div>
    </div>
  );
}

